import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAdminAuth } from '../context/useAuth.js';
import { PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';

const date = (value) => (value ? new Date(value).toLocaleString() : '—');
const remainingTime = (value) => {
  if (!value) return '—';
  const milliseconds = new Date(value).getTime() - Date.now();
  if (milliseconds <= 0) return 'Expired';
  if (milliseconds >= 86400000) {
    const days = Math.floor(milliseconds / 86400000);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const hours = Math.ceil(milliseconds / 3600000);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
};
const nav = [
  ['Dashboard', '/admin'],
  ['Users', '/admin/users'],
  ['Plans', '/admin/plans'],
  ['Features', '/admin/features'],
  ['Activation Links', '/admin/activation-links'],
  ['QR Batches', '/admin/qr-batches'],
  ['Activity', '/admin/activity'],
];
function ErrorText({ error }) {
  return error ? (
    <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  ) : null;
}
function useResource(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData((await api.get(path)).data);
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { data, error, loading, refresh };
}

export function AdminLayout() {
  const { admin, logout } = useAdminAuth();
  return (
    <div className="min-h-screen bg-canvas dark:bg-[#0d1310]">
      <header className="border-b border-[#e1e5df] bg-ink px-4 text-white dark:border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 py-4">
          <Link to="/admin" className="font-display text-xl font-bold">
            Orbit <span className="text-lime">Admin</span>
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-xs">
            {[
              ...nav,
              ...(admin?.role === 'SUPER_ADMIN'
                ? [
                    ['Admins', '/admin/admins'],
                    ['Settings', '/admin/settings'],
                    ['Automation Settings', '/admin/settings/automation'],
                  ]
                : []),
            ].map(([label, to]) => (
              <NavLink
                key={to}
                end={to === '/admin'}
                to={to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 ${isActive ? 'bg-white/15' : 'text-white/60 hover:text-white'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="text-xs text-white/60">{admin?.fullName}</span>
          <button onClick={logout} className="text-xs underline">
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminDashboard() {
  const { data, error, loading } = useResource('/admin/dashboard');
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Access and activation health across Orbit."
      />
      <ErrorText error={error} />
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.metrics).map(([key, value]) => (
              <div key={key} className="panel p-5">
                <p className="text-xs uppercase tracking-wide text-[#7a857e]">
                  {key.replace(/([A-Z])/g, ' $1')}
                </p>
                <p className="mt-3 font-display text-3xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <ListPanel
              title="Expiring soon"
              rows={data.expiring}
              render={(row) => `${row.user?.email || 'Unknown'} · ${date(row.expiresAt)}`}
            />
            <ListPanel
              title="Recent activations"
              rows={data.activations}
              render={(row) =>
                `${row.user?.email || 'Unknown'} · ${row.planSnapshot?.name || 'Plan'}`
              }
            />
            <ListPanel
              title="Recent links"
              rows={data.links}
              render={(row) => `${row.plan?.name || 'Plan'} · ${row.status}`}
            />
          </div>
        </>
      )}
    </>
  );
}
function ListPanel({ title, rows = [], render }) {
  return (
    <section className="panel p-5">
      <h2 className="mb-4 font-display font-bold">{title}</h2>
      <div className="space-y-3 text-sm">
        {rows.length ? (
          rows.map((row) => (
            <div key={row._id} className="border-b border-black/5 pb-2 dark:border-white/5">
              {render(row)}
            </div>
          ))
        ) : (
          <p className="text-[#7a857e]">Nothing here yet.</p>
        )}
      </div>
    </section>
  );
}

export function AdminUsers() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .get('/admin/users', { params: { search, filter, page } })
      .then((response) => {
        if (live) {
          setResult(response);
          setError('');
        }
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [search, filter, page]);
  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Users"
        description="Account status and access history, without private workspace content."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          className="field max-w-sm"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="field max-w-52"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          {['ALL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'EXPIRING_SOON'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                {['User', 'Access', 'Plan', 'Expires', 'Telegram'].map((label) => (
                  <th key={label} className="p-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data?.map((row) => (
                <tr key={row._id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-4">
                    <Link
                      className="font-bold text-accent hover:underline"
                      to={`/admin/users/${row._id}`}
                    >
                      {row.fullName}
                    </Link>
                    <div className="text-xs text-[#7a857e]">{row.email}</div>
                  </td>
                  <td className="p-4">
                    <StatusBadge tone={row.accessStatus === 'ACTIVE' ? 'success' : 'warning'}>
                      {row.accessStatus}
                    </StatusBadge>
                  </td>
                  <td className="p-4">{row.access?.planSnapshot?.name || '—'}</td>
                  <td className="p-4">{date(row.access?.expiresAt)}</td>
                  <td className="p-4">{row.telegram ? 'Connected' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result?.data?.length && <p className="p-6 text-sm text-[#7a857e]">No users found.</p>}
        </div>
      )}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {result?.pagination?.pages || 1}
        </span>
        <button
          className="btn-secondary"
          disabled={page >= (result?.pagination?.pages || 1)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}

export function AdminUserDetail() {
  const { id } = useParams();
  const { data, error, loading, refresh } = useResource(`/admin/users/${id}`);
  const plans = useResource('/admin/plans');
  const [planId, setPlanId] = useState('');
  const [url, setUrl] = useState('');
  const [actionError, setActionError] = useState('');
  async function status(value) {
    try {
      await api.patch(`/admin/users/${id}/status`, { status: value });
      setActionError('');
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  async function renewal() {
    try {
      const response = await api.post(`/admin/users/${id}/renewal-link`, { planId });
      setUrl(response.data.url);
      setActionError('');
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader
        eyebrow="User detail"
        title={data?.user?.fullName || 'User'}
        description={data?.user?.email}
      />
      <ErrorText error={error || actionError} />
      {data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="panel space-y-3 p-5 text-sm">
            <h2 className="font-display text-lg font-bold">Identity and access</h2>
            <p>
              Status:{' '}
              <StatusBadge tone={data.user.status === 'ACTIVE' ? 'success' : 'danger'}>
                {data.user.status}
              </StatusBadge>
            </p>
            <p>Created: {date(data.user.createdAt)}</p>
            <p>Last login: {date(data.user.lastLoginAt)}</p>
            <p>Plan: {data.access?.planSnapshot?.name || 'None'}</p>
            <p>
              Access:{' '}
              {data.user.status === 'SUSPENDED'
                ? 'SUSPENDED'
                : data.access
                  ? data.access.status
                  : 'NO_ACCESS'}
            </p>
            <p>Started: {date(data.access?.startedAt)}</p>
            <p>Expires: {date(data.access?.expiresAt)}</p>
            <p>Remaining: {remainingTime(data.access?.expiresAt)}</p>
            <p>
              Telegram:{' '}
              {data.telegram
                ? `@${data.telegram.telegramUsername || data.telegram.telegramUserId} · linked ${date(data.telegram.linkedAt)}`
                : 'Not connected'}
            </p>
            {data.telegram && (
              <p>Last Telegram activity: {date(data.telegram.lastInteractionAt)}</p>
            )}
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => status(data.user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
              >
                {data.user.status === 'ACTIVE' ? 'Suspend' : 'Unsuspend'}
              </button>
            </div>
          </section>
          <section className="panel p-5">
            <h2 className="font-display text-lg font-bold">Generate renewal link</h2>
            <select
              className="field mt-4"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              <option value="">Select plan</option>
              {plans.data
                ?.filter((plan) => plan.status === 'ACTIVE')
                .map((plan) => (
                  <option key={plan._id} value={plan._id}>
                    {plan.name}
                  </option>
                ))}
            </select>
            <button disabled={!planId} className="btn-primary mt-3" onClick={renewal}>
              Generate link
            </button>
            {url && (
              <p className="mt-4 break-all rounded-lg bg-[#f3f6f2] p-3 text-xs dark:bg-white/5">
                {url}
                <button
                  className="ml-2 text-accent underline"
                  onClick={() => navigator.clipboard.writeText(url)}
                >
                  Copy
                </button>
              </p>
            )}
          </section>
          <section className="panel p-5 lg:col-span-2">
            <h2 className="mb-4 font-display text-lg font-bold">Access history</h2>
            <div className="space-y-3">
              {data.history.map((row) => (
                <div
                  key={row._id}
                  className="rounded-xl border border-black/10 p-3 text-sm dark:border-white/10"
                >
                  <b>{row.planSnapshot?.name}</b> · {row.planSnapshot?.durationValue}{' '}
                  {row.planSnapshot?.durationUnit}
                  <div className="text-xs text-[#7a857e]">
                    Activated {date(row.activatedAt)} · expires {date(row.expiresAt)} · link{' '}
                    {row.activationLink}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function AdminActivationLinks() {
  const [page, setPage] = useState(1);
  const { data: plans } = useResource('/admin/plans');
  const { data, error, loading, refresh } = useResource(`/admin/activation-links?page=${page}`);
  const [planId, setPlanId] = useState('');
  const [validityDays, setValidityDays] = useState(7);
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [actionError, setActionError] = useState('');
  const [selected, setSelected] = useState(null);
  async function generate(event) {
    event.preventDefault();
    try {
      const response = await api.post('/admin/activation-links', { planId, validityDays, note });
      setUrl(response.data.url);
      setActionError('');
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  async function copy(id) {
    try {
      const response = await api.get(`/admin/activation-links/${id}/url`);
      await navigator.clipboard.writeText(response.data.url);
      setUrl(response.data.url);
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  async function revoke(id) {
    if (!window.confirm('Revoke this Activation Link?')) return;
    try {
      await api.post(`/admin/activation-links/${id}/revoke`);
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Activation Links"
        description="Single-use invitations for first access and renewal."
      />
      <ErrorText error={error || actionError} />
      <form onSubmit={generate} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-4">
        <label>
          <span className="label">Plan</span>
          <select
            required
            className="field"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">Select plan</option>
            {plans
              ?.filter((plan) => plan.status === 'ACTIVE')
              .map((plan) => (
                <option key={plan._id} value={plan._id}>
                  {plan.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span className="label">Valid for days</span>
          <input
            type="number"
            min="1"
            max="365"
            className="field"
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
          />
        </label>
        <label>
          <span className="label">Internal note</span>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn-primary self-end">Generate</button>
      </form>
      {url && (
        <p className="mb-5 break-all rounded-xl bg-emerald-50 p-4 text-sm dark:bg-emerald-400/10">
          {url}{' '}
          <button
            className="ml-2 text-accent underline"
            onClick={() => navigator.clipboard.writeText(url)}
          >
            Copy
          </button>
        </p>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                {[
                  'Plan',
                  'Status',
                  'Created by',
                  'Created',
                  'Link expires',
                  'Activated user',
                  'Activated at',
                  'Note',
                  'Actions',
                ].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row._id} className="border-b border-black/5 dark:border-white/5">
                  <td className="p-3">{row.plan?.name || row.planSnapshot?.name}</td>
                  <td className="p-3">
                    <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {row.status}
                    </StatusBadge>
                  </td>
                  <td className="p-3">{row.createdByAdmin?.fullName}</td>
                  <td className="p-3">{date(row.createdAt)}</td>
                  <td className="p-3">{date(row.expiresAt)}</td>
                  <td className="p-3">{row.activatedUser?.email || '—'}</td>
                  <td className="p-3">{date(row.activatedAt)}</td>
                  <td className="p-3">{row.note || '—'}</td>
                  <td className="p-3">
                    <button className="mr-3 text-accent underline" onClick={() => setSelected(row)}>
                      View
                    </button>
                    {row.status === 'ACTIVE' && (
                      <>
                        <button
                          className="mr-3 text-accent underline"
                          onClick={() => copy(row._id)}
                        >
                          Copy
                        </button>
                        <button className="text-red-600 underline" onClick={() => revoke(row._id)}>
                          Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section className="panel mt-5 space-y-2 p-5 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Activation Link details</h2>
            <button className="text-accent underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <p>
            Plan: {selected.planSnapshot?.name} · {selected.planSnapshot?.durationValue}{' '}
            {selected.planSnapshot?.durationUnit}
          </p>
          <p>
            Status: {selected.status} · opened {selected.openCount || 0} times
          </p>
          <p>
            First opened: {date(selected.firstOpenedAt)} · last opened:{' '}
            {date(selected.lastOpenedAt)}
          </p>
          <p>Intended user: {selected.intendedUser?.email || 'Any account'}</p>
          <p>
            Activated user: {selected.activatedUser?.email || '—'} · activated at:{' '}
            {date(selected.activatedAt)}
          </p>
        </section>
      )}
      <div className="mt-4 flex gap-3">
        <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="btn-secondary"
          disabled={!data?.length}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}

export function AdminActivity() {
  const { data, error, loading } = useResource('/admin/activity');
  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="Activity"
        description="Administrative and access events."
      />
      <ErrorText error={error} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel divide-y divide-black/5 dark:divide-white/5">
          {data?.map((row) => (
            <div key={row._id} className="flex justify-between gap-3 p-4 text-sm">
              <div>
                <b>{row.event}</b>
                <p className="text-xs text-[#7a857e]">
                  {row.actorType} · {row.targetType || 'Platform'}
                </p>
              </div>
              <span className="text-xs text-[#7a857e]">{date(row.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function AdminAdmins() {
  const { data, error, loading, refresh } = useResource('/admin/admins');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'ADMIN' });
  const [actionError, setActionError] = useState('');
  async function create(event) {
    event.preventDefault();
    try {
      await api.post('/admin/admins', form);
      setForm({ fullName: '', email: '', password: '', role: 'ADMIN' });
      setActionError('');
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  async function change(id, patch) {
    try {
      await api.patch(`/admin/admins/${id}`, patch);
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Admins"
        description="Separate administrative accounts and roles."
      />
      <ErrorText error={error || actionError} />
      <form onSubmit={create} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-5">
        <input
          required
          className="field"
          placeholder="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          required
          type="email"
          className="field"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          required
          minLength="12"
          type="password"
          className="field"
          placeholder="Password (12+)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="field"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option>ADMIN</option>
          <option>SUPER_ADMIN</option>
        </select>
        <button className="btn-primary">Create admin</button>
      </form>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          {data?.map((row) => (
            <div key={row._id} className="panel flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="flex-1">
                <b>{row.fullName}</b>
                <p className="text-xs text-[#7a857e]">{row.email}</p>
              </div>
              <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>
                {row.status}
              </StatusBadge>
              <select
                className="field max-w-44"
                value={row.role}
                onChange={(e) => change(row._id, { role: e.target.value })}
              >
                <option>ADMIN</option>
                <option>SUPER_ADMIN</option>
              </select>
              <button
                className="text-accent underline"
                onClick={() =>
                  change(row._id, { status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
                }
              >
                {row.status === 'ACTIVE' ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function AdminSettings() {
  const { data, error, loading, refresh } = useResource('/admin/settings');
  const [actionError, setActionError] = useState('');
  async function webhook(action) {
    try {
      await api.post(`/admin/settings/telegram/webhook/${action}`);
      setActionError('');
      refresh();
    } catch (failure) {
      setActionError(failure.message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Platform settings"
        description="Telegram infrastructure is configured through server environment variables."
      />
      <Link to="/admin/settings/automation" className="btn-secondary mb-5 inline-flex">Automation Settings</Link>
      <ErrorText error={error || actionError} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel max-w-xl space-y-4 p-5 text-sm">
          <p>
            Bot token: <b>{data?.telegramConfigured ? 'Configured' : 'Not configured'}</b>
          </p>
          <p>
            Bot username: <b>{data?.botUsername || 'Not configured'}</b>
          </p>
          <p>
            Webhook secret: <b>{data?.webhookConfigured ? 'Configured' : 'Not configured'}</b>
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => webhook('register')}>
              Register webhook
            </button>
            <button className="btn-secondary" onClick={() => webhook('remove')}>
              Remove webhook
            </button>
          </div>
          <p className="text-xs text-[#7a857e]">Secrets are never returned to this page.</p>
        </div>
      )}
    </>
  );
}
