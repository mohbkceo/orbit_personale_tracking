import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Bell,
  CalendarDays,
  Database,
  Compass,
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
import EventPreferences from './EventPreferences.jsx';
import { useTelegram } from '../context/TelegramContext.js';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';
import { displayValue, formatDate, formatDateTime } from '../utils/format.js';

const tabs = [
  ['general', Globe2],
  ['appearance', Palette],
  ['telegram', Bot],
  ['reminders', Bell],
  ['events', CalendarDays],
  ['account', UserRound],
  ['data', Database],
  ['security', ShieldCheck],
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
  const { t: _t } = useTranslation();
  const { t } = useTranslation();
  const { toast, setSettings } = useApp();
  const { user, access, refresh } = useAuth();
  const { status: telegram, link, setOpen: openTelegram, refresh: refreshTelegram } = useTelegram();
  const [tab, setTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(null);
  const [gender, setGender] = useState(user?.gender || '');
  const savedAppearance = useRef(null);
  useEffect(() => {
    Promise.all([api.get('/settings'), endpoints.list('accounts').catch(() => ({ data: [] }))])
      .then(([settings, accountList]) => {
        savedAppearance.current = normalizeAppearance(settings.data.appearance, settings.data.theme);
        setForm(settings.data);
        setAccounts(accountList.data);
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
      toast(t('saved'));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function saveGender() {
    setBusy(true);
    try { await api.patch('/auth/me', { gender }); await refresh(); toast(_t('settings:ui.profileUpdated')); }
    catch (error) { toast(error.message, 'error'); }
    finally { setBusy(false); }
  }
  if (loading) return <Spinner label={t('loading')} />;
  if (!form)
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t('unavailable')}
        description={t('unavailableDetail')}
      />
    );
  return (
    <>
      <PageHeader
        eyebrow={t('workspace')}
        title={t('settings:title')}
        description={t('settings:description')}
        actions={
          <button disabled={busy} className="btn-primary" onClick={save}>
            <Save size={16} />
            {t(busy ? 'saving' : 'save')}
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        <nav className="panel-flat h-fit p-2">
          {tabs.map(([id, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold ${tab === id ? 'bg-selected text-primary' : 'text-muted hover:bg-hover'}`}
            >
              <Icon size={17} />
              {t(`settings:${id === 'account' ? 'accountAccess' : id}`)}
            </button>
          ))}
        </nav>
        <div className="space-y-4">
          {tab === 'general' && <section className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-display text-lg font-bold"><Compass size={19} className="text-primary" /> {t('gettingStarted')}</h2><p className="mt-1 text-sm text-muted">{t('settings:gettingStartedDescription')}</p></div><Link to="/panel?onboarding=1" className="btn-secondary shrink-0">{t('openGuide')}</Link></section>}
          {tab === 'events' && <EventPreferences />}
          {tab === 'general' && (
            <Section
              title={t('settings:generalPreferences')}
              description={t('settings:generalDescription')}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">{t('settings:workspaceName')}</span>
                  <input className="field" value={form.name || ''} onChange={set('name')} />
                </label>
                <label>
                  <span className="label">{t('timezone')}</span>
                  <input className="field" value={form.timezone || ''} onChange={set('timezone')} />
                </label>
                <label>
                  <span className="label">{t('defaultCurrency')}</span>
                  <input
                    maxLength="3"
                    className="field uppercase"
                    value={form.defaultCurrency || ''}
                    onChange={set('defaultCurrency')}
                  />
                </label>
                <label>
                  <span className="label">{t('dateFormat')}</span>
                  <select
                    className="field"
                    value={form.dateFormat || 'DD MMM YYYY'}
                    onChange={set('dateFormat')}
                  >
                    <option value="DD MMM YYYY">{_t('settings:ui.ddMmmYyyy')}</option>
                    <option value="MM/DD/YYYY">{_t('settings:ui.mmDdYyyy')}</option>
                    <option value="YYYY-MM-DD">{_t('settings:ui.yyyyMmDd')}</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 border-t border-border pt-4"><p className="label">{t('language')}</p><p className="mb-2 text-xs text-muted">{t('settings:languageHelp')}</p><LanguageSelector /></div>
            </Section>
          )}
          {tab === 'appearance' && (
            <Section title={_t('settings:appearance')} description={_t('settings:ui.previewYourWorkspaceNowThenSaveYourChanges')}>
              <AppearancePicker appearance={normalizeAppearance(form.appearance, form.theme)} gender={user?.gender} onChange={(appearance) => setForm((value) => ({ ...value, appearance }))} />
            </Section>
          )}
          {tab === 'telegram' && (
            <>
              <Section
                title={_t('settings:telegram')}
                description={_t('settings:ui.oneCentralOrbitBotConnectedSecurelyToYourAccount')}
              >
                <div className="flex items-center gap-3">
                  <StatusBadge tone={telegram?.connected ? 'success' : 'neutral'}>
                    {telegram?.connected ? _t('common:connected') : _t('common:notConnected')}
                  </StatusBadge>
                  {telegram?.connected && (
                    <span className="text-sm">
                      @{telegram.telegramUsername || _t('settings:ui.telegramUser')}{' '}{_t('settings:ui.linked2')}{' '}
                      {formatDate(telegram.linkedAt)}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  {telegram?.connected ? (
                    <button disabled={busy} className="btn-secondary" onClick={() => openTelegram(true)}>{_t('settings:ui.manageConnection')}</button>
                  ) : (
                    <button disabled={busy} className="btn-primary" onClick={() => openTelegram(true)}>{_t('settings:ui.connectTelegram')}</button>
                  )}
                  <button className="btn-secondary" onClick={refreshTelegram}>{_t('settings:ui.refreshStatus')}</button>
                </div>
                {link && (
                  <p className="mt-3 break-all text-xs">{_t('settings:ui.ifTheChatDidNotOpenUse')}{' '}
                    <a
                      className="text-primary underline"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >{_t('settings:ui.thisConnectionLink')}</a>{_t('settings:ui.itExpiresIn15Minutes')}</p>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="label">{_t('settings:ui.defaultExpenseAccount')}</span>
                    <select
                      className="field"
                      value={form.telegram?.defaultExpenseAccount || ''}
                      onChange={onTelegram('defaultExpenseAccount')}
                    >
                      <option value="">{_t('settings:ui.chooseAccount')}</option>
                      {accounts.map((account) => (
                        <option key={account._id} value={account._id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">{_t('settings:ui.defaultIncomeAccount')}</span>
                    <select
                      className="field"
                      value={form.telegram?.defaultIncomeAccount || ''}
                      onChange={onTelegram('defaultIncomeAccount')}
                    >
                      <option value="">{_t('settings:ui.chooseAccount')}</option>
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
                    {!form.telegram?.defaultExpenseAccount && _t('settings:ui.chooseADefaultExpenseAccountForTelegramExpensesAndOutgoingDebtPa')}
                    {!form.telegram?.defaultIncomeAccount && _t('settings:ui.chooseADefaultIncomeAccountForTelegramSalesIncomeAndIncomingDebt')}
                  </p>
                )}
                <div className="mt-4 rounded-xl border border-border p-4 text-xs ">
                  <p className="font-bold">{_t('settings:ui.quickSyntax')}</p>
                  <p className="mt-2">{_t('settings:ui.tTaskDinIncomingDebtDoutOutgoingDebtSSaleEExpenseIIncome')}</p>
                  <p className="mt-2 font-mono">{_t('settings:ui.tCallSupplierTomorrow')}<br />{_t('settings:ui.dinAhmed5000')}<br />{_t('settings:ui.s12500StandX3')}</p>
                </div>
              </Section>
              <Section title={_t('settings:ui.scheduledSummaries')} description={_t('settings:ui.sentInYourConfiguredTimezone')}>
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
            <Section title={_t('settings:ui.automaticReminders')} description={_t('settings:ui.chooseWhetherScheduledRemindersAndTaskDigestsAreSent')}><div className="space-y-4"><label className="flex items-center justify-between text-sm font-semibold">{_t('settings:ui.remindersEnabled')}<input type="checkbox" checked={form.reminders?.enabled ?? true} onChange={onReminder('enabled')} /></label><label className="flex items-center justify-between text-sm font-semibold">{_t('settings:ui.automaticReminders')}<input type="checkbox" checked={form.reminders?.automaticEnabled ?? true} onChange={onReminder('automaticEnabled')} /></label></div></Section>
            <Section title={_t('settings:ui.activeAndQuietHours')} description={_t('common:dynamic.scheduledIn', { time: form.timezone })}><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">{_t('settings:ui.activeFrom')}</span><input className="field" type="time" value={form.reminders?.activeHours?.start || '08:00'} onChange={onReminder('start', 'activeHours')} /></label><label><span className="label">{_t('settings:ui.activeUntil')}</span><input className="field" type="time" value={form.reminders?.activeHours?.end || '22:00'} onChange={onReminder('end', 'activeHours')} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminders?.quietHours?.enabled ?? true} onChange={onReminder('enabled', 'quietHours')} />{_t('settings:ui.quietHoursEnabled')}</label><div className="grid grid-cols-2 gap-2"><input className="field" type="time" value={form.reminders?.quietHours?.start || '22:00'} onChange={onReminder('start', 'quietHours')} /><input className="field" type="time" value={form.reminders?.quietHours?.end || '08:00'} onChange={onReminder('end', 'quietHours')} /></div></div></Section>
            <Section title={_t('settings:ui.followUps')} description={_t('settings:ui.keepIncompleteCuesUsefulWithoutRepeatedNoise')}><div className="grid gap-4 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reminders?.incompleteFollowUpsEnabled ?? true} onChange={onReminder('incompleteFollowUpsEnabled')} />{_t('settings:ui.incompleteFollowUps')}</label><label><span className="label">{_t('settings:ui.maximumAutomaticFollowUps')}</span><input className="field" type="number" min="0" max="5" value={form.reminders?.maxAutomaticFollowUps ?? 2} onChange={onReminder('maxAutomaticFollowUps')} /></label><label><span className="label">{_t('settings:ui.minimumSpacingMinutes')}</span><input className="field" type="number" min="0" max="1440" value={form.reminders?.minimumReminderSpacingMinutes ?? 120} onChange={onReminder('minimumReminderSpacingMinutes')} /></label></div></Section>
            <Section title={_t('settings:ui.defaultEntityBehavior')} description={_t('settings:ui.existingItemsMayHaveTheirOwnReminderMode')}><div className="grid gap-3 sm:grid-cols-2">{['task', 'debt', 'bill', 'subscription', 'goal'].map((type) => <label key={type}><span className="label capitalize">{type}</span><select className="field" value={form.reminders?.defaultEntityModes?.[type] || 'automatic'} onChange={onReminder(type, 'defaultEntityModes')}><option value="automatic">{_t('settings:ui.automatic')}</option><option value="custom">{_t('settings:ui.custom')}</option><option value="off">{_t('settings:ui.off')}</option></select></label>)}</div></Section>
            <Section title={_t('settings:ui.delivery')} description={_t('settings:ui.chooseWhereRemindersMayAppear')}><div className="flex flex-wrap gap-6 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.reminders?.deliveryChannels?.telegram ?? true} onChange={onReminder('telegram', 'deliveryChannels')} />{_t('settings:telegram')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.reminders?.deliveryChannels?.web ?? true} onChange={onReminder('web', 'deliveryChannels')} />{_t('settings:ui.webAttentionSchedule')}</label></div></Section>
          </>}
          {tab === 'account' && (
            <Section
              title={_t('settings:accountAccess')}
              description={_t('settings:ui.yourIdentityAndCurrentTimeBasedPlan')}
            >
              <div className="space-y-3 text-sm">
                <div className="max-w-xs pb-3"><label htmlFor="profile-gender" className="label">{_t('settings:ui.aboutYou')}</label><select id="profile-gender" className="field" value={gender} onChange={(event) => setGender(event.target.value)}><option value="">{_t('settings:ui.chooseGender')}</option><option value="MALE">{_t('settings:ui.male')}</option><option value="FEMALE">{_t('settings:ui.female')}</option></select><p className="mt-1 text-xs text-muted">{_t('settings:ui.usedOnlyToOrderWorkspaceStyleRecommendations')}</p><button type="button" className="btn-secondary mt-3" disabled={busy || !gender || gender === user?.gender} onClick={saveGender}>{_t('settings:ui.saveProfile')}</button></div>
                <p>
                  <b>{_t('settings:ui.name')}</b> {user?.fullName}
                </p>
                <p>
                  <b>{_t('settings:ui.email')}</b> {user?.email}
                </p>
                <p>
                  <b>{_t('settings:ui.status')}</b> <StatusBadge tone="success">{user?.status}</StatusBadge>
                </p>
                <p>
                  <b>{_t('settings:ui.access')}</b> {displayValue(access?.eligible ? 'active' : access?.reason || 'no_access')}
                </p>
                <p>
                  <b>{_t('settings:ui.plan')}</b> {access?.subscription?.planSnapshot?.name || _t('settings:ui.free')}
                </p>
                <p>
                  <b>{_t('settings:ui.activated')}</b>{' '}
                  {access?.subscription?.activatedAt
                    ? formatDateTime(access.subscription.activatedAt)
                    : _t('settings:ui.never')}
                </p>
                <p>
                  <b>{_t('settings:ui.expires')}</b>{' '}
                  {access?.subscription?.expiresAt
                    ? formatDateTime(access.subscription.expiresAt)
                    : _t('settings:ui.never')}
                </p>
                <p>
                  <b>{_t('settings:ui.remaining')}</b>{' '}
                  {access?.subscription?.expiresAt
                    ? Math.max(
                        0,
                        Math.ceil(
                          (new Date(access.subscription.expiresAt).getTime() - Date.now()) /
                            86400000,
                        ),
                      ) + ' days'
                    : _t('settings:ui.unlimited')}
                </p>
              </div>
            </Section>
          )}
          {tab === 'data' && (
            <Section title={_t('settings:ui.exportYourData')} description={_t('settings:ui.onlyYourOwnRecordsAreIncluded')}>
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
            <Section title={_t('settings:ui.accountSecurity')} description={_t('settings:ui.authenticatedPrivateAccess')}>
              <div className="space-y-3 text-sm leading-6 text-muted ">
                <p>{_t('settings:ui.orbitUsesAPasswordProtectedAccountAndAnHttponlySessionCookieYour')}</p>
                <p>{_t('settings:ui.accessIsCheckedOnEveryProtectedApiRequestExpirationDoesNotEraseY')}</p>
                <p>{_t('settings:ui.theTelegramBotTokenIsManagedByThePlatformAndIsNeverShownInUserSe')}</p>
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
