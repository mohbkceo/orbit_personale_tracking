import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { emptyFilters, errorMessage, isSelected, toggleUser } from '../broadcastModel.js';

export default function RecipientPicker({ selection, onChange }) {
  const [filters, setFilters] = useState(() => selection.allMatching ? selection.filters : { ...emptyFilters });
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; api.get('/admin/broadcast-audience/plans').then((response) => { if (active) setPlans(response.data); }).catch((failure) => { if (active) setError(errorMessage(failure)); }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      // Browsing must never be restricted to the IDs already selected for delivery.
      api.post('/admin/broadcast-audience/users', { selection: { filters, allMatching: true, includeIds: [], excludeIds: [] }, promotional: true, page, limit: 25 })
        .then((response) => { if (active) { setResult(response.data); setError(''); } })
        .catch((failure) => { if (active) setError(errorMessage(failure)); })
        .finally(() => { if (active) setBusy(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [filters, page]);
  function filter(key, value) { setFilters((current) => ({ ...current, [key]: value })); setPage(1); }
  const locked = selection.allMatching;
  return <div className="mt-3 min-w-0 space-y-3">
    <div className="grid gap-2 sm:grid-cols-2">
      <input className="field sm:col-span-2" aria-label="Search users" placeholder="Search name, email, or Telegram username" maxLength={100} value={filters.search} disabled={locked} onChange={(event) => filter('search', event.target.value)} />
      <select className="field" aria-label="Subscription plan" value={filters.planIds[0] || ''} disabled={locked} onChange={(event) => filter('planIds', event.target.value ? [event.target.value] : [])}><option value="">All plans</option>{plans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select>
      <select className="field" aria-label="Account status" value={filters.status} disabled={locked} onChange={(event) => filter('status', event.target.value)}><option value="ALL">All account statuses</option><option value="ACTIVE">Active accounts</option><option value="SUSPENDED">Suspended accounts</option></select>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <button className="text-primary underline" type="button" disabled={busy || !result.total || locked} onClick={() => onChange({ filters: { ...filters }, allMatching: true, includeIds: [], excludeIds: [] })}>Select all {result.total || ''}</button>
      <button className="text-primary underline" type="button" onClick={() => onChange({ filters: { ...emptyFilters }, allMatching: false, includeIds: [], excludeIds: [] })}>Clear selection</button>
      <span className="text-muted" role="status">{locked ? `All matching users across pages${selection.excludeIds.length ? ` · ${selection.excludeIds.length} deselected` : ''}` : `${selection.includeIds.length} selected`}</span>
    </div>
    {locked && <p className="text-xs text-muted">Clear selection to change filters.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div aria-busy={busy} className="max-h-64 overflow-y-auto divide-y divide-border rounded-xl border border-border">
      {busy ? <p className="p-4 text-sm text-muted" role="status">Loading users…</p> : result.rows.length ? result.rows.map((user) => <label key={user._id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
        <input type="checkbox" aria-label={`Select ${user.fullName}`} checked={isSelected(selection, user._id)} onChange={() => onChange(toggleUser(selection, user._id))} />
        <span className="min-w-0 flex-1"><strong className="block truncate">{user.fullName}</strong><span className="block truncate text-xs text-muted">{user.email || user.phone}{user.telegramUsername ? ` · @${user.telegramUsername}` : ''}</span></span>
        <span className="text-xs text-muted">{!user.connected ? 'No Telegram' : user.status !== 'ACTIVE' ? 'Suspended' : user.suppressed ? 'Unavailable' : user.hasActivePaid ? user.planName || 'Subscriber' : 'Free'}</span>
      </label>) : <p className="p-4 text-sm text-muted">No users found.</p>}
    </div>
    <div className="flex items-center justify-between gap-2 text-sm"><button type="button" className="btn-secondary" disabled={busy || page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>{page} / {Math.max(1, Math.ceil(result.total / 25))}</span><button type="button" className="btn-secondary" disabled={busy || page * 25 >= result.total} onClick={() => setPage((current) => current + 1)}>Next</button></div>
  </div>;
}
