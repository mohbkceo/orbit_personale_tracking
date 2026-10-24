import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { useAdminAuth } from '../context/useAuth.js';
import { BulkUserActions } from './admin/BulkUserActions.jsx';
export { AdminUserDetail } from './admin/UserDetail.jsx';

const date = (value) => (value ? new Date(value).toLocaleString() : '—');
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
                <p className="text-xs uppercase tracking-wide text-muted">
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
          <p className="text-muted">Nothing here yet.</p>
        )}
      </div>
    </section>
  );
}

export function AdminUsers() {
  const { admin } = useAdminAuth();
  const superAdmin = admin?.role === 'SUPER_ADMIN';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkUsers, setBulkUsers] = useState(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let live = true;
    setSelected(new Set());
    setLoading(true);
    api
      .get('/admin/users', { params: { search: query, filter, page } })
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
  }, [query, filter, page, refreshVersion]);
  const rows = result?.data || [];
  const selectedRows = rows.filter((row) => selected.has(row._id));
  const allVisibleSelected = rows.length > 0 && selectedRows.length === rows.length;
  function toggleUser(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleVisible() {
    setSelected(allVisibleSelected ? new Set() : new Set(rows.map((row) => row._id)));
  }
  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Users"
        description="Find an account, review its access, and open its management profile."
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          className="field max-w-sm"
          aria-label="Search users by name or email"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <select
          className="field max-w-52"
          aria-label="Filter users by access status"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          {['ALL', 'ACTIVE', 'FREE', 'SUSPENDED', 'EXPIRING_SOON'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {superAdmin && !loading && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">{selectedRows.length} selected on this page</span>
          <button className="underline" onClick={toggleVisible}>
            {allVisibleSelected ? 'Deselect all on this page' : 'Select all on this page'}
          </button>
          <button className="btn-secondary" disabled={!selectedRows.length} onClick={() => setBulkUsers(selectedRows)}>
            Apply action
          </button>
          {selectedRows.length > 0 && <button className="underline" onClick={() => setSelected(new Set())}>Clear selection</button>}
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel overflow-hidden border border-border bg-white shadow-xs">
          <p className="border-b border-border px-4 py-3 text-xs text-muted">{result?.pagination?.total || 0} users</p>
          <table className="admin-records w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                {superAdmin && <th className="p-4"><input type="checkbox" aria-label="Select all users on this page" checked={allVisibleSelected} onChange={toggleVisible} /></th>}
                {['User', 'Access', 'Plan', 'Expires', 'Telegram'].map((label) => (
                  <th key={label} className="p-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-black/5 dark:border-white/5">
                  {superAdmin && <td data-label="Select" className="p-4"><input type="checkbox" aria-label={`Select ${row.fullName} (${row.email})`} checked={selected.has(row._id)} onChange={() => toggleUser(row._id)} /></td>}
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{row.fullName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                      <div className="min-w-0"><Link
                        className="font-bold text-primary hover:underline"
                        to={`/admin/users/${row._id}`}
                      >
                        {row.fullName}
                      </Link>
                      <div className="break-all text-xs text-muted">{row.email}</div>
                      <div className="text-xs text-muted">Joined {date(row.createdAt)} · Last login {date(row.lastLoginAt)}</div></div>
                    </div>
                  </td>
                  <td data-label="Status" className="p-4">
                    <StatusBadge tone={row.accessStatus === 'ACTIVE' ? 'success' : 'warning'}>
                      {row.accessStatus}
                    </StatusBadge>
                  </td>
                  <td data-label="Plan" className="p-4">{row.access?.planSnapshot?.name || 'Free'}</td>
                  <td data-label="Expires" className="p-4">{date(row.access?.expiresAt)}</td>
                  <td data-label="Telegram" className="p-4">{row.telegram ? 'Connected' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result?.data?.length && <p className="p-6 text-sm text-muted">No users found.</p>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
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
      {bulkUsers && (
        <BulkUserActions
          users={bulkUsers}
          onClose={() => setBulkUsers(null)}
          onApplied={async () => { setPage(1); setRefreshVersion((value) => value + 1); }}
        />
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
      <form onSubmit={generate} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
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
            className="ml-2 text-primary underline"
            onClick={() => navigator.clipboard.writeText(url)}
          >
            Copy
          </button>
        </p>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <div className="panel admin-scroll-table">
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
                    <button className="mr-3 text-primary underline" onClick={() => setSelected(row)}>
                      View
                    </button>
                    {row.status === 'ACTIVE' && (
                      <>
                        <button
                          className="mr-3 text-primary underline"
                          onClick={() => copy(row._id)}
                        >
                          Copy
                        </button>
                        <button className="text-danger underline" onClick={() => revoke(row._id)}>
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
            <button className="text-primary underline" onClick={() => setSelected(null)}>
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
            <div key={row._id} className="flex flex-wrap justify-between gap-3 p-4 text-sm">
              <div className="min-w-0 break-words">
                <b>{row.event}</b>
                <p className="text-xs text-muted">
                  {row.actorType} · {row.targetType || 'Platform'}
                </p>
              </div>
              <span className="text-xs text-muted">{date(row.createdAt)}</span>
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
      <form onSubmit={create} className="panel mb-5 grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <input
          required
          className="field"
          aria-label="Admin full name"
          placeholder="Full name"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          required
          type="email"
          className="field"
          aria-label="Admin email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          required
          minLength="12"
          type="password"
          className="field"
          aria-label="Admin password"
          placeholder="Password (12+)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <select
          className="field"
          aria-label="Admin role"
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
              <div className="min-w-0 flex-1 break-words">
                <b>{row.fullName}</b>
                <p className="text-xs text-muted">{row.email}</p>
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
                className="text-primary underline"
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
