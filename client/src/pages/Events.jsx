import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader, Spinner } from '../components/ui.jsx';

const lead = (minutes) => minutes % 1440 === 0 ? `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before` : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'} before` : `${minutes} minutes before`;
const when = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const slug = (value) => value?.labels?.en || value?.labels?.fr || value?.slug || '';
function EventCard({ item, following, canFollow, canCustomize, onNotify, onUnfollow, onCustomize }) {
  return <article className="panel space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-display text-lg font-bold">{item.title}</h2><p className="text-xs text-muted">{item.provider === 'dzevent' ? 'DZ Event' : item.provider} · {item.scheduleStatus}{item.orbitVisibility?.status === 'featured' ? ' · Featured' : ''}</p></div><span className="rounded-full bg-selected px-2 py-1 text-xs text-primary">{item.format || 'Event'}</span></div><p className="text-sm">{when(item.startsAt)}{item.venue?.name ? ` · ${item.venue.name}` : ''}</p><p className="text-xs text-muted">{item.wilaya?.names?.en || item.wilaya?.slug || 'Algeria'} · {slug(item.eventType)} · {item.categories?.map(slug).filter(Boolean).join(', ')}</p><div className="flex flex-wrap gap-2">{item.providerUrl && <a className="btn-secondary" href={item.providerUrl} target="_blank" rel="noopener noreferrer">View event</a>}{following ? <>{canCustomize && <button className="btn-secondary" type="button" onClick={() => onCustomize(item)}>Customize</button>}<button className="btn-secondary" type="button" onClick={() => onUnfollow(item)}>Unfollow</button></> : canFollow && <button className="btn-primary" type="button" onClick={() => onNotify(item)}>Notify me</button>}</div></article>;
}
export default function Events() {
  const [tab, setTab] = useState('discover');
  const [items, setItems] = useState(null);
  const [following, setFollowing] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [filters, setFilters] = useState({ wilaya: '', category: '', type: '', format: '' });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [selected, setSelected] = useState(null);
  const [custom, setCustom] = useState(false);
  const [offsets, setOffsets] = useState([]);
  const [channels, setChannels] = useState([]);
  const [changeAlerts, setChangeAlerts] = useState({});
  const [quietPolicy, setQuietPolicy] = useState('move_earlier');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const [catalog, follows, prefs] = await Promise.all([api.get('/events', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), page } }), api.get('/events/following'), api.get('/events/preferences')]); setItems(catalog.data); setPagination(catalog.pagination); setFollowing(follows.data); setPreferences(prefs.data); }, [filters, page]);
  useEffect(() => { load().catch((failure) => setError(failure.message)); }, [load]);
  const followingIds = new Set(following.map((row) => row.externalEventId));
  const admin = preferences?.effective?.admin;
  const canFollow = admin?.integration?.enabled && admin?.reminders?.enabled && admin?.userControls?.follow !== false;
  const canTiming = admin?.reminders?.userCanCustomize && admin?.userControls?.reminderTiming !== false;
  const canChannels = admin?.userControls?.deliveryChannels === true;
  const canChange = admin?.userControls?.changeAlerts === true && admin?.changes?.enabled;
  const canQuiet = admin?.userControls?.quietHoursPolicy === true && admin?.quietHours?.userCanOverride;
  const canCustomize = canTiming || canChannels || canChange || canQuiet;
  function open(item, edit = false) { const subscription = following.find((row) => row.externalEventId === item.externalId); setSelected({ item, edit }); setOffsets(subscription?.reminderOffsetsMinutes || preferences?.effective?.reminderOffsetsMinutes || []); setChannels(subscription?.deliveryChannels || preferences?.effective?.deliveryChannels || []); setChangeAlerts(subscription?.changeAlerts || preferences?.effective?.changeAlerts || {}); setQuietPolicy(subscription?.quietHoursPolicy || preferences?.effective?.quietHoursPolicy || 'move_earlier'); setCustom(edit && canCustomize); setError(''); }
  async function submit() { if (!selected) return; setBusy(true); setError(''); try { const payload = custom ? { ...(canTiming ? { defaultReminderOffsetsMinutes: offsets.map(Number) } : {}), ...(canChannels ? { deliveryChannels: channels } : {}), ...(canChange ? { changeAlerts } : {}), ...(canQuiet ? { quietHoursPolicy: quietPolicy } : {}) } : {}; if (selected.edit) await api.patch(`/events/${selected.item.externalId}/follow`, payload); else await api.post(`/events/${selected.item.externalId}/follow`, payload); setSelected(null); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  async function unfollow(item) { setBusy(true); setError(''); try { await api.delete(`/events/${item.externalId}/follow`); await load(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <div className="space-y-5"><PageHeader title="Events" description="Discover Algerian events and follow only the ones you choose." />{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex gap-2"><button className={tab === 'discover' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('discover')}>Discover</button><button className={tab === 'following' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('following')}>Following ({following.length})</button></div>
    {tab === 'discover' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['wilaya', 'Wilaya', admin?.catalog?.allowedWilayas], ['category', 'Category', admin?.catalog?.allowedCategories], ['type', 'Event type', admin?.catalog?.allowedTypes]].map(([key, label, allowed]) => allowed?.length ? <select key={key} className="field" aria-label={label} value={filters[key]} onChange={(event) => { setFilters({ ...filters, [key]: event.target.value }); setPage(1); }}><option value="">All {label.toLowerCase()}s</option>{allowed.map((value) => <option key={value} value={value}>{value}</option>)}</select> : <input key={key} className="field" aria-label={label} placeholder={`${label} slug`} value={filters[key]} onChange={(event) => { setFilters({ ...filters, [key]: event.target.value }); setPage(1); }} />)}<select className="field" aria-label="Format" value={filters.format} onChange={(event) => { setFilters({ ...filters, format: event.target.value }); setPage(1); }}><option value="">All formats</option>{(admin?.catalog?.allowedFormats?.length ? admin.catalog.allowedFormats : ['physical', 'in-person', 'online']).map((value) => <option value={value} key={value}>{value}</option>)}</select></div>}
    {!items ? <Spinner /> : tab === 'discover' ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.length ? items.map((item) => <EventCard key={item._id} item={item} following={followingIds.has(item.externalId)} canFollow={canFollow} canCustomize={canCustomize} onNotify={open} onUnfollow={unfollow} onCustomize={(value) => open(value, true)} />) : <p className="panel p-5 text-sm text-muted">No events are available yet. The catalog updates on the next provider sync.</p>}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{following.length ? following.filter((row) => row.event).map((row) => <EventCard key={row._id} item={row.event} following canCustomize={canCustomize} onNotify={open} onUnfollow={unfollow} onCustomize={(value) => open(value, true)} />) : <p className="panel p-5 text-sm text-muted">You are not following any events yet.</p>}</div>}
    {tab === 'discover' && pagination?.pages > 1 && <div className="flex items-center justify-center gap-3 text-sm"><button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pagination.pages}</span><button className="btn-secondary" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/50 p-4" role="dialog" aria-modal="true" aria-label="Event notifications">
      <div className="panel max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-6">
        <h2 className="font-display text-xl font-bold">{selected.edit ? 'Event notifications' : `Notify me about ${selected.item.title}`}</h2>
        <p className="text-sm text-muted">You’ll be reminded:</p>
        <ul className="space-y-1 text-sm">{offsets.map((offset) => <li key={offset}>✓ {lead(offset)}</li>)}</ul>
        <p className="text-sm text-muted">Delivery: {channels.join(', ') || 'None'}</p>
        {canCustomize && <button className="btn-secondary" type="button" onClick={() => setCustom(!custom)}>{custom ? 'Hide options' : 'Customize'}</button>}
        {custom && canCustomize && <div className="space-y-3 border-t border-border pt-4">
          {canTiming && <label className="block text-sm"><span className="label">Reminder offsets (minutes, comma separated)</span><input className="field" value={offsets.join(', ')} onChange={(event) => setOffsets(event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} /></label>}
          {canChannels && <div className="flex gap-4 text-sm">{['telegram', 'web'].filter((channel) => admin.delivery[channel]).map((channel) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={channels.includes(channel)} onChange={(event) => setChannels(event.target.checked ? [...channels, channel] : channels.filter((value) => value !== channel))} />{channel}</label>)}</div>}
          {canChange && <div><p className="label">Change alerts</p><div className="grid gap-2 sm:grid-cols-2">{['startTime', 'endTime', 'venue', 'postponed', 'cancelled', 'unavailable', 'providerUrl', 'format', 'description', 'cover', 'category'].filter((key) => admin.changes[key]).map((key) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={changeAlerts[key] ?? true} onChange={(event) => setChangeAlerts({ ...changeAlerts, [key]: event.target.checked })} />{key.replace(/([A-Z])/g, ' $1')}</label>)}</div></div>}
          {canQuiet && <label className="block"><span className="label">Quiet hours policy</span><select className="field" value={quietPolicy} onChange={(event) => setQuietPolicy(event.target.value)}><option value="move_earlier">Move earlier</option><option value="deliver_exact">Deliver exact</option><option value="skip">Skip</option></select></label>}
        </div>}
        <div className="flex flex-wrap justify-end gap-2"><button className="btn-secondary" type="button" onClick={() => setSelected(null)}>Cancel</button><button className="btn-primary" type="button" disabled={busy} onClick={submit}>{busy ? 'Saving…' : selected.edit ? 'Save notifications' : 'Enable notifications'}</button></div>
      </div>
    </div>}
  </div>;
}
