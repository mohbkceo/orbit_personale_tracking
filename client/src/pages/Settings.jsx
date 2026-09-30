import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Bell,
  Database,
  Globe2,
  Palette,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { api, endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useAuth } from '../context/useAuth.js';
import { EmptyState, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { AppearancePicker } from '../appearance/AppearancePicker.jsx';
import { normalizeAppearance } from '../appearance/themes.js';

const tabs = [
  ['general', 'General', Globe2],
  ['appearance', 'Appearance', Palette],
  ['telegram', 'Telegram', Bot],
  ['reminders', 'Reminders', Bell],
  ['account', 'Account & access', UserRound],
  ['data', 'Data', Database],
  ['security', 'Security', ShieldCheck],
];
function Section({ title, description, children }) {
  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-5 border-b border-border pb-4">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-1 text-xs text-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { toast, setSettings } = useApp();
  const { user, access, refresh } = useAuth();
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [telegram, setTelegram] = useState(null);
  const [link, setLink] = useState(null);
  const [gender, setGender] = useState(user?.gender || '');
  const savedAppearance = useRef(null);
  useEffect(() => {
    Promise.all([api.get('/settings'), endpoints.list('accounts'), api.get('/telegram-link')])
      .then(([settings, accountList, connection]) => {
        savedAppearance.current = normalizeAppearance(settings.data.appearance, settings.data.theme);
        setForm(settings.data);
        setAccounts(accountList.data);
        setTelegram(connection.data);
      })
      .catch((error) => toast(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => { if (form?.appearance) setSettings((current) => ({ ...current, appearance: form.appearance })); }, [form?.appearance, setSettings]);
  useEffect(() => () => { if (savedAppearance.current) setSettings((current) => ({ ...current, appearance: savedAppearance.current })); }, [setSettings]);
  useEffect(() => { setGender(user?.gender || ''); }, [user?.gender]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const onTelegram = (key) => (event) =>
    setForm((value) => ({
      ...value,
      telegram: {
        ...value.telegram,
        [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
      },
    }));
  const onReminder = (key, group) => (event) => setForm((value) => ({
    ...value,
    reminders: group ? { ...value.reminders, [group]: { ...value.reminders?.[group], [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value } } : { ...value.reminders, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value },
  }));
  async function save() {
    setBusy(true);
    try {
      const {
        name,
        timezone,
        defaultCurrency,
        dateFormat,
        weekStartsOn,
        appearance,
        expenseCategories,
        incomeCategories,
        telegram: preferences,
        reminders,
      } = form;
      const response = await api.patch('/settings', {
        name,
        timezone,
        defaultCurrency,
        dateFormat,
        weekStartsOn,
        appearance,
        expenseCategories,
        incomeCategories,
        telegram: preferences,
        reminders,
      });
      setForm(response.data);
      savedAppearance.current = response.data.appearance;
      setSettings(response.data);
      if (gender && gender !== user?.gender) { await api.patch('/auth/me', { gender }); await refresh(); }
      toast('Settings saved');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function saveGender() {
    setBusy(true);
    try { await api.patch('/auth/me', { gender }); await refresh(); toast('Profile updated'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }
  async function connect() {
    setBusy(true);
    try {
      const response = await api.post('/telegram-link');
      setLink(response.data);
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
      toast('Complete the link in Telegram');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    if (!window.confirm('Disconnect Telegram from Orbit?')) return;
    setBusy(true);
    try {
      await api.delete('/telegram-link');
      setTelegram({ connected: false });
      setLink(null);
      toast('Telegram disconnected');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function refreshTelegram() {
    try {
      setTelegram((await api.get('/telegram-link')).data);
    } catch (error) {
      toast(error.message, 'error');
    }
  }
  if (loading) return <Spinner label="Loading settings…" />;
  if (!form)
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Settings unavailable"
        description="Check that the API and MongoDB are running."
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Make Orbit fit your preferences and connected devices."
        actions={
          <button disabled={busy} className="btn-primary" onClick={save}>
            <Save size={16} />
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav className="panel-flat h-fit p-2">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold ${tab === id ? 'bg-primary text-primary-text' : 'text-muted hover:bg-hover'}`}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          {tab === 'general' && (
            <Section
              title="General preferences"
              description="Used across dates, money and summaries"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Workspace name</span>
                  <input className="field" value={form.name || ''} onChange={set('name')} />
                </label>
                <label>
                  <span className="label">Timezone</span>
                  <input className="field" value={form.timezone || ''} onChange={set('timezone')} />
                </label>
                <label>
                  <span className="label">Default currency</span>
                  <input
                    maxLength="3"
                    className="field uppercase"
                    value={form.defaultCurrency || ''}
                    onChange={set('defaultCurrency')}
                  />
                </label>
                <label>
                  <span className="label">Date format</span>
                  <select
                    className="field"
                    value={form.dateFormat || 'DD MMM YYYY'}
                    onChange={set('dateFormat')}
                  >
                    <option>DD MMM YYYY</option>
                    <option>MM/DD/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </label>
              </div>
            </Section>
          )}
          {tab === 'appearance' && (
            <Section title="Appearance" description="Preview your workspace now, then save your changes">
              <AppearancePicker appearance={normalizeAppearance(form.appearance, form.theme)} gender={user?.gender} onChange={(appearance) => setForm((value) => ({ ...value, appearance }))} />
            </Section>
          )}
          {tab === 'telegram' && (
            <>
              <Section
                title="Telegram"
                description="One central Orbit bot, connected securely to your account"
              >
                <div className="flex items-center gap-3">
                  <StatusBadge tone={telegram?.connected ? 'success' : 'neutral'}>
                    {telegram?.connected ? 'Connected' : 'Not connected'}
                  </StatusBadge>
                  {telegram?.connected && (
                    <span className="text-sm">
                      @{telegram.telegramUsername || 'Telegram user'} · linked{' '}
                      {new Date(telegram.linkedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  {telegram?.connected ? (
                    <button disabled={busy} className="btn-secondary" onClick={disconnect}>
                      Disconnect Telegram
                    </button>
                  ) : (
                    <button disabled={busy} className="btn-primary" onClick={connect}>
                      Connect Telegram
                    </button>
                  )}
                  <button className="btn-secondary" onClick={refreshTelegram}>
                    Refresh status
                  </button>
                </div>
                {link && (
                  <p className="mt-3 break-all text-xs">
                    If the chat did not open, use{' '}
                    <a
                      className="text-primary underline"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      this connection link
                    </a>
                    . It expires in 15 minutes.
                  </p>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="label">Default expense account</span>
                    <select
                      className="field"
                      value={form.telegram?.defaultExpenseAccount || ''}
                      onChange={onTelegram('defaultExpenseAccount')}
                    >
                      <option value="">Choose account</option>
                      {accounts.map((account) => (
                        <option key={account._id} value={account._id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">Default income account</span>
                    <select
                      className="field"
                      value={form.telegram?.defaultIncomeAccount || ''}
                      onChange={onTelegram('defaultIncomeAccount')}
                    >
                      <option value="">Choose account</option>
                      {accounts.map((account) => (
                        <option key={account._id} value={account._id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {(!form.telegram?.defaultExpenseAccount || !form.telegram?.defaultIncomeAccount) && (
                  <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                    {!form.telegram?.defaultExpenseAccount && 'Choose a default expense account for Telegram expenses and outgoing debt payments. '}
                    {!form.telegram?.defaultIncomeAccount && 'Choose a default income account for Telegram sales, income and incoming debt payments.'}
                  </p>
                )}
                <div className="mt-4 rounded-xl border border-border p-4 text-xs ">
                  <p className="font-bold">Quick syntax</p>
                  <p className="mt-2">t Task · din Incoming debt · dout Outgoing debt · s Sale · e Expense · i Income</p>
                  <p className="mt-2 font-mono">t Call supplier tomorrow<br />din Ahmed 5000<br />s 12500 Stand x3</p>
                </div>
              </Section>
              <Section title="Scheduled summaries" description="Sent in your configured timezone">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['morningSummaryEnabled', 'morningSummaryTime', 'Morning summary'],
                    ['dailySummaryEnabled', 'dailySummaryTime', 'Daily wrap-up'],
                  ].map(([enabled, time, label]) => (
                    <div
                      key={enabled}
                      className="rounded-xl border border-border p-4 "
                    >
                      <label className="flex items-center justify-between text-sm font-bold">
                        {label}
                        <input
                          type="checkbox"
                          checked={Boolean(form.telegram?.[enabled])}
                          onChange={onTelegram(enabled)}
                        />
                      </label>
                      <input
                        type="time"
                        className="field mt-3"
                        value={form.telegram?.[time] || ''}
                        onChange={onTelegram(time)}
                      />
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
          {tab === 'reminders' && <>
            <Section title="Automatic reminders" description="Choose whether scheduled reminders and Task Digests are sent."><div className="space-y-4"><label className="flex items-center justify-between text-sm font-semibold">Reminders enabled<input type="checkbox" checked={form.reminders?.enabled ?? true} onChange={onReminder('enabled')} /></label><label className="flex items-center justify-between text-sm font-semibold">Automatic reminders<input type="checkbox" checked={form.reminders?.automaticEnabled ?? true} onChange={onReminder('automaticEnabled')} /></label></div></Section>
            <Section title="Active and quiet hours" description={`Scheduled in ${form.timezone}`}><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Active from</span><input className="field" type="time" value={form.reminders?.activeHours?.start || '08:00'} onChange={onReminder('start', 'activeHours')} /></label><label><span className="label">Active until</span><input className="field" type="time" value={form.reminders?.activeHours?.end || '22:00'} onChange={onReminder('end', 'activeHours')} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminders?.quietHours?.enabled ?? true} onChange={onReminder('enabled', 'quietHours')} />Quiet hours enabled</label><div className="grid grid-cols-2 gap-2"><input className="field" type="time" value={form.reminders?.quietHours?.start || '22:00'} onChange={onReminder('start', 'quietHours')} /><input className="field" type="time" value={form.reminders?.quietHours?.end || '08:00'} onChange={onReminder('end', 'quietHours')} /></div></div></Section>
            <Section title="Follow-ups" description="Keep incomplete cues useful without repeated noise"><div className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminders?.incompleteFollowUpsEnabled ?? true} onChange={onReminder('incompleteFollowUpsEnabled')} />Incomplete follow-ups</label><label><span className="label">Maximum automatic follow-ups</span><input className="field" type="number" min="0" max="5" value={form.reminders?.maxAutomaticFollowUps ?? 2} onChange={onReminder('maxAutomaticFollowUps')} /></label><label><span className="label">Minimum spacing · minutes</span><input className="field" type="number" min="0" max="1440" value={form.reminders?.minimumReminderSpacingMinutes ?? 120} onChange={onReminder('minimumReminderSpacingMinutes')} /></label></div></Section>
            <Section title="Default entity behavior" description="Existing items may have their own reminder mode"><div className="grid gap-3 sm:grid-cols-2">{['task', 'debt', 'bill', 'subscription', 'goal'].map((type) => <label key={type}><span className="label capitalize">{type}</span><select className="field" value={form.reminders?.defaultEntityModes?.[type] || 'automatic'} onChange={onReminder(type, 'defaultEntityModes')}><option value="automatic">Automatic</option><option value="custom">Custom</option><option value="off">Off</option></select></label>)}</div></Section>
            <Section title="Delivery" description="Choose where reminders may appear"><div className="flex flex-wrap gap-6 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.reminders?.deliveryChannels?.telegram ?? true} onChange={onReminder('telegram', 'deliveryChannels')} />Telegram</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.reminders?.deliveryChannels?.web ?? true} onChange={onReminder('web', 'deliveryChannels')} />Web attention schedule</label></div></Section>
          </>}
          {tab === 'account' && (
            <Section
              title="Account & access"
              description="Your identity and current time-based plan"
            >
              <div className="space-y-3 text-sm">
                <div className="max-w-xs pb-3"><label htmlFor="profile-gender" className="label">About you</label><select id="profile-gender" className="field" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">Choose gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select><p className="mt-1 text-xs text-muted">Used only to order workspace style recommendations.</p><button type="button" className="btn-secondary mt-3" disabled={busy || !gender || gender === user?.gender} onClick={saveGender}>Save profile</button></div>
                <p>
                  <b>Name:</b> {user?.fullName}
                </p>
                <p>
                  <b>Email:</b> {user?.email}
                </p>
                <p>
                  <b>Status:</b> <StatusBadge tone="success">{user?.status}</StatusBadge>
                </p>
                <p>
                  <b>Access:</b> {access?.eligible ? 'ACTIVE' : access?.reason || 'NO_ACCESS'}
                </p>
                <p>
                  <b>Plan:</b> {access?.subscription?.planSnapshot?.name || 'None'}
                </p>
                <p>
                  <b>Activated:</b>{' '}
                  {access?.subscription?.activatedAt
                    ? new Date(access.subscription.activatedAt).toLocaleString()
                    : '—'}
                </p>
                <p>
                  <b>Expires:</b>{' '}
                  {access?.subscription?.expiresAt
                    ? new Date(access.subscription.expiresAt).toLocaleString()
                    : '—'}
                </p>
                <p>
                  <b>Remaining:</b>{' '}
                  {access?.subscription?.expiresAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(access.subscription.expiresAt).getTime() - Date.now()) /
                            86400000,
                        ),
                      ) + ' days'
                    : '—'}
                </p>
              </div>
            </Section>
          )}
          {tab === 'data' && (
            <Section title="Export your data" description="Only your own records are included">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['transactions', 'Transactions CSV'],
                  ['debts', 'Debts CSV'],
                  ['tasks', 'Tasks CSV'],
                  ['all', 'Full JSON backup'],
                ].map(([resource, label]) => (
                  <a
                    key={resource}
                    href={`/api/export/${resource}${resource === 'all' ? '' : '?format=csv'}`}
                    className="btn-secondary justify-start"
                  >
                    <Database size={16} />
                    {label}
                  </a>
                ))}
              </div>
            </Section>
          )}
          {tab === 'security' && (
            <Section title="Account security" description="Authenticated, private access">
              <div className="space-y-3 text-sm leading-6 text-muted ">
                <p>
                  Orbit uses a password-protected account and an HttpOnly session cookie. Your
                  workspace data is private to your account.
                </p>
                <p>
                  Access is checked on every protected API request. Expiration does not erase your
                  data or disconnect Telegram.
                </p>
                <p>
                  The Telegram bot token is managed by the platform and is never shown in user
                  settings.
                </p>
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
