import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';

const sections = [
  ['provider', 'DZ Event provider', 'Enable or pause requests to DZ Event.'],
  ['integration', 'Synchronization', 'One shared provider sync for Orbit.'],
  ['catalog', 'Catalog restrictions', 'Leave a list empty to allow all values. Use public slugs separated by commas.'],
  ['discovery', 'Discovery notifications', 'Recommendations never follow an event automatically.'],
  ['reminders', 'Event reminders', 'Defaults apply when a user follows an event.'],
  ['changes', 'Change alerts', 'Choose meaningful provider changes that may notify followers.'],
  ['delivery', 'Delivery channels', 'Channels available to event notifications.'],
  ['quietHours', 'Quiet hours', 'Choose how event reminders behave around quiet hours.'],
  ['userControls', 'User controls', 'Choose which preferences users may customize.'],
  ['limits', 'Platform limits', 'Hard limits apply to all users.'],
];
const label = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
const valueLabel = (minutes) => minutes % 1440 === 0 ? `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before` : minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'} before` : `${minutes} minutes before`;
const editable = (section, value) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !['configured', 'keySource', 'keyConfiguredAt', 'lastConnectionTestAt', 'lastConnectionTestSuccess', 'lastConnectionError', 'name', 'sync', 'encryptedApiKey', 'apiKey'].includes(key) && (section !== 'provider' || key === 'enabled')));

function OffsetEditor({ offsets, onChange }) {
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState(1440);
  return <div className="sm:col-span-2 xl:col-span-3"><span className="label">Default reminder times</span><div className="flex flex-wrap gap-2">{offsets.map((offset) => <button key={offset} type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => onChange(offsets.filter((value) => value !== offset))} title="Remove offset">{valueLabel(offset)} ×</button>)}</div><div className="mt-3 flex flex-wrap gap-2"><input aria-label="Offset amount" className="field w-24" type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /><select aria-label="Offset unit" className="field w-36" value={unit} onChange={(event) => setUnit(Number(event.target.value))}><option value={1440}>days</option><option value={60}>hours</option><option value={1}>minutes</option></select><button className="btn-secondary" type="button" onClick={() => onChange([...new Set([...offsets, amount * unit])].sort((a, b) => b - a))}>Add time</button></div></div>;
}

export default function AdminEventSettings() {
  const [value, setValue] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { api.get('/admin/settings/events').then((result) => setValue(result.data)).catch((failure) => setError(failure.message)); api.get('/admin/settings/events/metrics').then((result) => setMetrics(result.data)).catch(() => {}); }, []);
  const change = (section, key, next) => { setValue((current) => ({ ...current, [section]: { ...current[section], [key]: next } })); setMessage(''); };
  async function action(name, request) {
    setBusy(name); setError(''); setMessage('');
    try { const result = await request(); if (result.data?.provider?.name) setValue(result.data); setMessage(result.data?.message || (result.data?.skipped ? `Sync skipped: ${result.data.skipped}` : `${name} complete`)); if (name === 'Save new API key') setApiKey(''); if (name === 'Sync now' || name === 'Test connection') { const updated = await api.get('/admin/settings/events'); setValue(updated.data); const summary = await api.get('/admin/settings/events/metrics'); setMetrics(summary.data); } }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  if (!value) return <Spinner label="Loading event settings…" />;
  return <div className="min-w-0 space-y-5"><PageHeader title="Events & Notifications" description="Configure DZ Event and Orbit event notifications." />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-selected p-3 text-sm text-primary">{message}</p>}
    <section className="panel space-y-4 p-5"><h2 className="font-display text-lg font-bold">DZ Event API key</h2><p className="text-sm text-muted">Status: {value.provider.configured ? 'Configured ✓' : 'Not configured'} · Source: {value.provider.keySource === 'database' ? 'Admin Settings' : value.provider.keySource === 'environment' ? 'Environment' : 'Not configured'}</p><p className="text-xs text-muted">Last test: {value.provider.lastConnectionTestAt ? new Date(value.provider.lastConnectionTestAt).toLocaleString() : 'Never'} · {value.provider.lastConnectionTestSuccess === true ? 'Connected' : value.provider.lastConnectionTestSuccess === false ? 'Failed' : 'Not tested'}</p>{value.provider.lastConnectionError && <p className="text-xs text-red-700">{value.provider.lastConnectionError}</p>}<label className="block"><span className="label">Enter a new API key</span><input aria-label="DZ Event API key" className="field" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="dze_live_…" /><span className="mt-1 block text-xs text-muted">Leaving this field blank keeps the current key.</span></label><div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={!!busy || !apiKey.trim()} onClick={() => action('Save new API key', () => api.put('/admin/settings/events', { apiKey }))}>Save new API key</button><button type="button" className="btn-secondary" disabled={!!busy} onClick={() => action('Test connection', () => api.post('/admin/settings/events/test'))}>Test connection</button><button type="button" className="btn-secondary" disabled={!!busy || value.provider.keySource !== 'database'} onClick={() => action('Remove API key', () => api.delete('/admin/settings/events/api-key'))}>Remove API key</button></div></section>
    <section className="panel space-y-3 p-5"><h2 className="font-display text-lg font-bold">Provider operations</h2><div className="grid gap-2 text-sm sm:grid-cols-2"><p>Last sync: {value.sync.lastSyncAt ? new Date(value.sync.lastSyncAt).toLocaleString() : 'Never'}</p><p>Last successful sync: {value.sync.lastSuccessfulSyncAt ? new Date(value.sync.lastSuccessfulSyncAt).toLocaleString() : 'Never'}</p><p>Orbit requests today: {value.sync.requestsToday || 0}</p><p>Tracked events: {metrics?.cachedEvents ?? '—'}</p><p>Visible events: {metrics?.visibleEvents ?? '—'}</p><p>Followed events: {metrics?.followedEvents ?? '—'}</p><p>Unique followers: {metrics?.uniqueFollowers ?? '—'}</p><p>Active reminders: {metrics?.activeEventReminders ?? '—'}</p><p>Delivered reminders: {metrics?.remindersDelivered ?? '—'}</p><p>Delivered discovery notices: {metrics?.discoveryNotificationsDelivered ?? '—'}</p></div><p className="text-xs text-muted">Most followed categories: {metrics?.mostFollowedCategories?.map((item) => `${item._id || 'Unknown'} (${item.count})`).join(', ') || '—'}</p><p className="text-xs text-muted">Most followed wilayas: {metrics?.mostFollowedWilayas?.map((item) => `${item._id || 'Unknown'} (${item.count})`).join(', ') || '—'}</p>{value.sync.lastProviderError && <p className="text-xs text-red-700">Last provider error: {value.sync.lastProviderError}</p>}<button type="button" className="btn-secondary" disabled={!!busy} onClick={() => action('Sync now', () => api.post('/admin/settings/events/sync', {}, { timeout: 120000 }))}>Sync now</button></section>
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); action('Save settings', () => api.put('/admin/settings/events', Object.fromEntries(sections.map(([name]) => [name, editable(name, value[name])])))); }}>
      {sections.map(([section, title, description]) => <section key={section} className="panel p-5"><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-muted">{description}</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(editable(section, value[section])).map(([key, current]) => key === 'defaultOffsetsMinutes' ? <OffsetEditor key={key} offsets={current} onChange={(next) => change(section, key, next)} /> : <label key={key} className="block text-sm"><span className="label">{label(key)}</span>{typeof current === 'boolean' ? <input type="checkbox" checked={current} onChange={(event) => change(section, key, event.target.checked)} /> : Array.isArray(current) ? <input className="field" value={current.join(', ')} onChange={(event) => change(section, key, event.target.value.split(',').map((part) => part.trim()).filter(Boolean))} placeholder="All allowed when blank" /> : key === 'policy' ? <select className="field" value={current} onChange={(event) => change(section, key, event.target.value)}><option value="move_earlier">Move earlier</option><option value="deliver_exact">Deliver exact</option><option value="skip">Skip</option></select> : <input className="field" type={typeof current === 'number' ? 'number' : 'text'} value={current ?? ''} onChange={(event) => change(section, key, typeof current === 'number' ? Number(event.target.value) : event.target.value)} />}</label>)}</div></section>)}
      <button className="btn-primary" disabled={!!busy}>Save event settings</button>
    </form>
  </div>;
}
