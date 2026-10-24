import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Spinner, StatusBadge } from '../../components/ui.jsx';
import { useAdminAuth } from '../../context/useAuth.js';
import { UserDialog, Field, Message } from './UserDialog.jsx';
import { SubscriptionDialog } from './SubscriptionDialog.jsx';
import { AccountDialog } from './AccountDialog.jsx';
import { DeleteUserDialog } from './DeleteUserDialog.jsx';

const when = (value) => (value ? new Date(value).toLocaleString() : '—');
const remaining = (value) =>
  value ? Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000)) : 0;
const tabs = ['Overview', 'Activity', 'Security'];
function Section({ title, children, className = '' }) {
  return (
    <section className={`border-b border-border py-6 last:border-b-0 ${className}`}>
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Facts({ items }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="mt-1 break-words font-medium">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function EnterSupport({ id, name, onClose }) {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function enter() {
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/support/sessions', { userId: id, reason, adminPassword, confirmed });
      navigate(`/admin/users/${id}/inside`, { replace: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <UserDialog title="Go Inside · Admin Support Mode" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p>
          You will view {name}&apos;s workspace in a read-only support session for up to 15 minutes.
          All access is audited.
        </p>
        <Field label="Support reason">
          <textarea
            className="field"
            rows="3"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength="10"
          />
        </Field>
        <Field label="Confirm admin password">
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>I confirm this access is for troubleshooting and is strictly read-only.</span>
        </label>
        <button
          className="btn-primary"
          disabled={busy || reason.trim().length < 10 || !adminPassword || !confirmed}
          onClick={enter}
        >
          {busy ? 'Entering…' : 'Enter read-only workspace'}
        </button>
        <Message error={error} />
      </div>
    </UserDialog>
  );
}

export function AdminUserDetail() {
  const { id } = useParams();
  const { admin } = useAdminAuth();
  const superAdmin = admin?.role === 'SUPER_ADMIN';
  const [data, setData] = useState(null);
  const [management, setManagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Overview');
  const [dialog, setDialog] = useState('');
  const refresh = useCallback(async () => {
    try {
      const detail = await api.get(`/admin/users/${id}`);
      setData(detail.data);
      if (superAdmin) {
        const extra = await api.get(`/admin/users/${id}/management`);
        setManagement(extra.data);
      }
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [id, superAdmin]);
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);
  const closeDialog = useCallback(() => setDialog(''), []);
  if (loading) return <Spinner />;
  if (!data)
    return (
      <div className="panel p-6">
        <p role="alert">{error || 'User unavailable.'}</p>
        <button className="btn-secondary mt-3" onClick={refresh}>
          Retry
        </button>
      </div>
    );
  const user = data.user;
  const access = data.access;
  const sessions = management?.sessions || [];
  const events = management?.events || [];
  const loginEvents = events.filter((row) => row.event === 'USER_LOGIN');
  return (
    <div className="min-w-0">
      <Link to="/admin/users" className="text-sm text-primary underline">
        ← Users
      </Link>
      <div className="mt-5 rounded-2xl border border-border bg-white p-5 shadow-xs sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div
              aria-hidden="true"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-lg font-semibold text-primary"
            >
              {user.fullName
                ?.split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="break-words font-display text-2xl font-semibold">{user.fullName}</h1>
              <p className="break-all text-sm text-muted">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                  {user.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                </StatusBadge>
                <span className="rounded-full border border-border px-2 py-1 text-xs">
                  {access?.planSnapshot?.name || 'Free plan'}
                </span>
                <span className="text-xs text-muted">
                  Telegram {data.telegram ? 'connected' : 'not connected'}
                </span>
              </div>
              <p className="mt-3 text-xs text-muted">
                Registered {when(user.createdAt)} · Last login {when(user.lastLoginAt)}
              </p>
            </div>
          </div>
          <details className="relative self-start text-sm">
            <summary className="btn-secondary cursor-pointer list-none">More ···</summary>
            <div className="absolute right-0 z-10 mt-1 min-w-40 rounded-xl border border-border bg-white p-2 shadow-xs">
              <button
                className="block w-full rounded-lg p-2 text-left hover:bg-surface-alt"
                onClick={() => {
                  setTab('Activity');
                  document.querySelector('#user-tabs')?.scrollIntoView();
                }}
              >
                View activity
              </button>
              <button
                className="block w-full rounded-lg p-2 text-left hover:bg-surface-alt"
                onClick={() => {
                  setTab('Security');
                  document.querySelector('#user-tabs')?.scrollIntoView();
                }}
              >
                View security
              </button>
            </div>
          </details>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
          <button
            className="btn-primary"
            disabled={!superAdmin}
            title={!superAdmin ? 'Super Admin only' : undefined}
            onClick={() => setDialog('subscription')}
          >
            Manage subscription
          </button>
          <button
            className="btn-secondary"
            disabled={!superAdmin}
            title={!superAdmin ? 'Super Admin only' : undefined}
            onClick={() => setDialog('account')}
          >
            Manage account
          </button>
          <button
            className="btn-secondary border-primary text-primary"
            disabled={!superAdmin}
            title={!superAdmin ? 'Super Admin only' : undefined}
            onClick={() => setDialog('inside')}
          >
            Go Inside · read-only
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}{' '}
          <button className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      )}
      <div
        id="user-tabs"
        role="tablist"
        aria-label="User management"
        className="mt-7 flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((name) => (
          <button
            key={name}
            id={`user-tab-${name.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls="user-tab-panel"
            tabIndex={tab === name ? 0 : -1}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${tab === name ? 'border-primary text-primary' : 'border-transparent text-muted'}`}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              const index = tabs.indexOf(name);
              const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next]);
              event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div id="user-tab-panel" role="tabpanel" aria-labelledby={`user-tab-${tab.toLowerCase()}`} tabIndex={0} className="min-w-0 px-1">
        {tab === 'Overview' && (
          <>
            <Section title="Identity and profile">
              <Facts
                items={[
                  ['Full name', user.fullName],
                  ['Email', user.email],
                  ['Gender', user.gender || 'Not set'],
                  ['Account', user.status],
                  [
                    'Onboarding',
                    user.onboardingCompletedAt
                      ? 'Completed'
                      : user.firstUseOnboarding?.status || 'Not completed',
                  ],
                  ['Registered', when(user.createdAt)],
                ]}
              />
            </Section>
            <Section title="Plan and connection">
              <Facts
                items={[
                  ['Current plan', access?.planSnapshot?.name || 'Free'],
                  [
                    'Access',
                    user.status === 'SUSPENDED' ? 'Suspended' : access ? 'Paid active' : 'Free',
                  ],
                  ['Expires', when(access?.expiresAt)],
                  [
                    'Telegram',
                    data.telegram
                      ? `@${data.telegram.telegramUsername || 'Connected'}`
                      : 'Not connected',
                  ],
                  ['Telegram linked', when(data.telegram?.linkedAt)],
                  ['Last login', when(user.lastLoginAt)],
                ]}
              />
            </Section>
            <Section title="Account metrics">
              <Facts
                items={Object.entries(data.metrics || {}).map(([key, value]) => [
                  key[0].toUpperCase() + key.slice(1),
                  value,
                ])}
              />
            </Section>
            <Section title="Quick actions">
              <p className="text-sm text-muted">
                Use Manage subscription or Manage account above for changes. Open Activity for
                access history and Security for sessions and diagnostics.
              </p>
            </Section>
          </>
        )}
        {tab === 'Activity' && (
          <>
            <Section title="Subscription and access">
              <Facts
                items={[
                  ['Plan', access?.planSnapshot?.name || 'Free'],
                  ['Source', access?.source || 'Free access'],
                  ['Started', when(access?.startedAt)],
                  ['Expiry', when(access?.expiresAt)],
                  ['Remaining days', access ? remaining(access.expiresAt) : '—'],
                  ['Account access', user.status === 'ACTIVE' ? 'Eligible' : 'Suspended'],
                ]}
              />
            </Section>
            <Section title="Available features">
              <div className="flex flex-wrap gap-2 text-xs">
                {data.features?.filter((feature) => feature.allowed).length ? (
                  data.features
                    .filter((feature) => feature.allowed)
                    .map((feature) => (
                      <span key={feature.key} className="rounded-full border border-border px-3 py-1.5">
                        {feature.key}{feature.limit != null ? ` · limit ${feature.limit}` : ''}
                      </span>
                    ))
                ) : (
                  <p className="text-sm text-muted">No features available.</p>
                )}
              </div>
            </Section>
            <Section title="Activation and grant history">
              {data.history.length ? (
                <div className="space-y-3 text-sm">
                  {data.history.map((row) => (
                    <div key={row._id} className="border-b border-border pb-3">
                      <b>{row.planSnapshot?.name || 'Plan'}</b> · {row.source}
                      {row.grantKind ? ` / ${row.grantKind}` : ''} · {row.status}
                      <p className="text-xs text-muted">
                        {when(row.activatedAt)} → {when(row.expiresAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No access history.</p>
              )}
            </Section>
            <Section title="Purchase history">
              {data.purchases?.length ? (
                data.purchases.map((row) => (
                  <p key={row._id} className="border-b border-border py-2 text-sm">
                    {row.planSnapshot?.name || 'Plan'} · {row.state} · {row.amountMinor / 100}{' '}
                    {row.currency} · {when(row.paidAt || row.createdAt)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted">No purchases.</p>
              )}
            </Section>
            <Section title="Login and user activity">
              {loginEvents.length ? (
                loginEvents.map((row) => (
                  <p key={row._id} className="border-b border-border py-2 text-sm">
                    Login · {when(row.createdAt)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted">No recent login events.</p>
              )}
            </Section>
            <Section title="Telegram interaction metadata">
              <Facts
                items={[
                  ['Connected', data.telegram ? 'Yes' : 'No'],
                  ['Linked', when(data.telegram?.linkedAt)],
                  ['Last interaction', when(data.telegram?.lastInteractionAt)],
                ]}
              />
              <div className="mt-4 space-y-2">
                {data.telegramInteractions?.length ? (
                  data.telegramInteractions.map((row) => (
                    <p key={row._id} className="border-b border-border pb-2 text-xs">
                      {row.kind} · {row.category} · {when(row.createdAt)}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted">No recorded Telegram interactions.</p>
                )}
              </div>
            </Section>
            <Section title="Account events and individual entitlements">
              <p className="text-sm text-muted">
                {management?.overrides?.length || 0} individual overrides. Use Manage subscription
                to review or change them.
              </p>
              {events.slice(0, 12).map((row) => (
                <p key={row._id} className="border-b border-border py-2 text-xs">
                  {row.event} · {when(row.createdAt)}
                </p>
              ))}
            </Section>
          </>
        )}
        {tab === 'Security' && (
          <>
            <Section title="Account security">
              <Facts
                items={[
                  ['Status', user.status],
                  ['Last login', when(user.lastLoginAt)],
                  ['Active sessions', sessions.filter((row) => !row.revokedAt).length],
                  ['Onboarding', user.onboardingCompletedAt ? 'Completed' : 'Pending'],
                ]}
              />
            </Section>
            <Section title="Login sessions and revocation">
              <div className="space-y-2 text-sm">
                {sessions.length ? (
                  sessions.map((row) => (
                    <p key={row._id} className="border-b border-border pb-2">
                      {row.userAgent || 'Browser'} · {when(row.createdAt)} ·{' '}
                      {row.revokedAt ? 'Revoked' : `Expires ${when(row.expiresAt)}`}
                    </p>
                  ))
                ) : (
                  <p className="text-muted">
                    No listed sessions. Older cookies can be invalidated with Revoke all sessions in
                    Manage account.
                  </p>
                )}
              </div>
            </Section>
            <Section title="Recovery and Telegram">
              <p className="text-sm text-muted">
                Password recovery and verified email changes send one-time links to the user.
                Telegram can be disconnected; the user reconnects from their settings.
              </p>
            </Section>
            <Section title="Support diagnostics">
              <Facts
                items={[
                  ['Telegram', data.telegram ? 'Connected' : 'Not connected'],
                  ['Plan', access?.planSnapshot?.name || 'Free'],
                  ['Subscription expiry', when(access?.expiresAt)],
                ]}
              />
              <p className="mt-3 text-sm text-muted">
                Go Inside opens an audited 15-minute read-only view of this workspace.
              </p>
              <div className="mt-3 space-y-2">
                {management?.supportSessions?.length ? (
                  management.supportSessions.map((row) => (
                    <p key={row._id} className="border-b border-border pb-2 text-xs">
                      Support session · {when(row.createdAt)} ·{' '}
                      {row.revokedAt ? 'Ended' : `Expires ${when(row.expiresAt)}`}
                    </p>
                  ))
                ) : (
                  <p className="text-sm text-muted">No support sessions.</p>
                )}
              </div>
            </Section>
            <Section title="Administrative audit history">
              {events.length ? (
                events.slice(0, 30).map((row) => (
                  <p key={row._id} className="border-b border-border py-2 text-xs">
                    {row.event} · {when(row.createdAt)}
                  </p>
                ))
              ) : (
                <p className="text-sm text-muted">No recent events.</p>
              )}
            </Section>
            <Section title="Danger Zone">
              <p className="text-sm text-red-700">
                Suspension, session revocation, and Telegram disconnection take effect immediately.
                Select these actions in Manage account and confirm your admin password. Deletion
                permanently erases the account and its personal workspace data.
              </p>
              {superAdmin && (
                <button
                  className="mt-4 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                  onClick={() => setDialog('delete')}
                >
                  Delete user
                </button>
              )}
            </Section>
          </>
        )}
      </div>
      {dialog === 'subscription' && (
        <SubscriptionDialog
          id={id}
          data={data}
          management={management}
          onClose={closeDialog}
          onChanged={refresh}
        />
      )}
      {dialog === 'account' && (
        <AccountDialog
          id={id}
          data={data}
          management={management}
          onClose={closeDialog}
          onChanged={refresh}
        />
      )}
      {dialog === 'inside' && <EnterSupport id={id} name={user.fullName} onClose={closeDialog} />}
      {dialog === 'delete' && <DeleteUserDialog user={user} onClose={closeDialog} />}
    </div>
  );
}
