import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { PageHeader, Spinner } from '../components/ui.jsx';

const planEntries = (feature, plans) => plans.map((plan) => {
  const entry = plan.features?.find((item) => String(item.feature?._id || item.feature) === String(feature._id));
  return { planId: plan._id, enabled: Boolean(entry?.enabled), limit: feature.type === 'LIMIT' ? entry?.limit ?? null : undefined,
    value: feature.type === 'TEXT' ? entry?.value || '' : undefined };
});

export default function AdminAccessControl() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('ALL');
  const [previewPlan, setPreviewPlan] = useState('');
  const [preview, setPreview] = useState(null);
  const [applyExisting, setApplyExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try { setData((await api.get('/admin/access-control')).data); setError(''); }
    catch (failure) { setError(failure.message); }
  }
  useEffect(() => { void load(); }, []);
  const plans = useMemo(() => data?.plans?.filter((plan) => plan.status === 'ACTIVE') || [], [data]);
  const features = useMemo(() => (data?.features || []).filter((feature) =>
    (scope === 'ALL' || feature.scope === scope) && `${feature.name} ${feature.key} ${feature.category}`.toLowerCase().includes(query.toLowerCase())), [data, query, scope]);
  const groups = useMemo(() => features.reduce((result, feature) => { (result[feature.category] ||= []).push(feature); return result; }, {}), [features]);
  function edit(feature) {
    setSelected(feature.key);
    setDraft({ accessMode: feature.accessMode || 'PLAN_BASED', scope: feature.scope || 'CAPABILITY', name: feature.name, description: feature.description || '', icon: feature.icon,
      order: feature.order || 0, publicVisible: feature.publicVisible !== false,
      locked: { title: feature.locked?.title || '', description: feature.locked?.description || '', explanation: feature.locked?.explanation || '',
        presentation: feature.locked?.presentation || 'BLUR', ctaLabel: feature.locked?.ctaLabel || 'Explore plans',
        visibleWhenLocked: feature.locked?.visibleWhenLocked !== false, recommendedPlan: feature.locked?.recommendedPlan || null },
      plans: planEntries(feature, plans) });
    setApplyExisting(false); setError(''); setNotice('');
  }
  const current = data?.features?.find((feature) => feature.key === selected);
  const update = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const updateLocked = (key, value) => setDraft((previous) => ({ ...previous, locked: { ...previous.locked, [key]: value } }));
  const updatePlan = (planId, changes) => setDraft((previous) => ({ ...previous, plans: previous.plans.map((entry) => entry.planId === planId ? { ...entry, ...changes } : entry) }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api.patch(`/admin/access-control/${encodeURIComponent(selected)}`, { ...draft, applyExisting });
      await load(); setNotice('Access configuration saved. Active sessions will refresh shortly.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function showPreview(planId) {
    setPreviewPlan(planId); setPreview(null);
    if (!planId) return;
    try { setPreview((await api.get('/admin/access-control/preview', { params: { planId } })).data); }
    catch (failure) { setError(failure.message); }
  }
  return <>
    <PageHeader eyebrow="Management" title="Access Control" description="Assign sections and capabilities to plans, set limits, and write the locked preview shown in the workspace." />
    {error && <p role="alert" className="mb-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success/10 p-3 text-sm text-success">{notice}</p>}
    {!data ? <Spinner label="Loading access control…" /> : <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="panel min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-2"><input className="field min-w-44 flex-1" aria-label="Search features" placeholder="Search sections and features" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="field w-auto" aria-label="Filter features" value={scope} onChange={(event) => setScope(event.target.value)}><option value="ALL">All</option><option value="SECTION">Sections</option><option value="CAPABILITY">Capabilities</option></select></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs"><thead><tr className="border-b border-border text-muted"><th className="p-2">Section / feature</th><th className="p-2">Mode</th>{plans.map((plan) => <th className="p-2 text-center" key={plan._id}>{plan.name}</th>)}</tr></thead>
          <tbody>{Object.entries(groups).map(([category, rows]) => <FragmentRows key={category} category={category} rows={rows} plans={plans} selected={selected} edit={edit} />)}</tbody></table></div>
      </section>
      <aside className="space-y-5">
        <section className="panel p-5"><h2 className="font-display text-lg font-bold">Preview plan</h2><select className="field mt-3" value={previewPlan} onChange={(event) => showPreview(event.target.value)}><option value="">Choose a plan</option>{plans.map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select>{preview && <div className="mt-3 max-h-52 space-y-1 overflow-y-auto text-xs">{Object.entries(preview.capabilities).map(([key, decision]) => <div key={key} className="flex justify-between gap-2"><span>{key}</span><span className={decision.allowed ? 'text-success' : 'text-muted'}>{decision.allowed ? decision.limit == null ? 'Enabled' : `Limit ${decision.limit}` : decision.reason === 'FEATURE_DISABLED' ? 'Unavailable' : 'Locked'}</span></div>)}</div>}</section>
        {current && draft ? <form onSubmit={save} className="panel space-y-4 p-5"><h2 className="font-display text-lg font-bold">Edit {current.name}</h2>
          <label className="block"><span className="label">Catalog scope</span><select className="field" value={draft.scope} onChange={(event) => update('scope', event.target.value)}><option value="SECTION">Section</option><option value="CAPABILITY">Capability</option></select></label>
          <label className="block"><span className="label">Access mode</span><select className="field" value={draft.accessMode} onChange={(event) => update('accessMode', event.target.value)}><option value="FREE">Free for everyone</option><option value="PLAN_BASED">Selected plans</option><option value="DISABLED">Unavailable globally</option></select></label>
          <div className="grid gap-2 sm:grid-cols-2">{plans.map((plan) => { const entry = draft.plans.find((item) => item.planId === plan._id); return <div key={plan._id} className="rounded-xl border border-border p-3"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={entry?.enabled || false} onChange={(event) => updatePlan(plan._id, { enabled: event.target.checked, ...(current.type === 'LIMIT' && event.target.checked && entry.limit == null ? { limit: 0 } : {}) })} />{plan.name}</label>{current.type === 'LIMIT' && entry?.enabled && <label className="mt-2 block"><span className="label">Maximum (0 blocks new items)</span><input type="number" min="0" className="field" value={entry.limit ?? 0} onChange={(event) => updatePlan(plan._id, { limit: Number(event.target.value) })} /></label>}{current.type === 'TEXT' && entry?.enabled && <input className="field mt-2" value={entry.value || ''} onChange={(event) => updatePlan(plan._id, { value: event.target.value })} />}</div>; })}</div>
          <p className="text-xs text-muted">Plan changes apply to future purchases. To update active subscribers, select the option below before saving. Free and globally unavailable modes take effect immediately.</p>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={applyExisting} onChange={(event) => setApplyExisting(event.target.checked)} />Apply plan assignments to existing paid subscribers</label>
          <div className="border-t border-border pt-3"><h3 className="font-bold">Locked presentation</h3><p className="mt-1 text-xs text-muted">Shown when the feature is restricted by plan.</p></div>
          <Field label="Display title" value={draft.name} onChange={(value) => update('name', value)} />
          <Field label="Catalog description" value={draft.description} onChange={(value) => update('description', value)} />
          <Field label="Iconify icon" value={draft.icon} onChange={(value) => update('icon', value)} />
          <Field label="Display order" type="number" value={draft.order} onChange={(value) => update('order', Number(value))} />
          <Field label="Locked title" value={draft.locked.title} onChange={(value) => updateLocked('title', value)} />
          <label className="block"><span className="label">Locked description</span><textarea className="field h-24" value={draft.locked.description} onChange={(event) => updateLocked('description', event.target.value)} /></label>
          <label className="block"><span className="label">Upgrade explanation</span><textarea className="field h-20" value={draft.locked.explanation} onChange={(event) => updateLocked('explanation', event.target.value)} /></label>
          <Field label="Upgrade button" value={draft.locked.ctaLabel} onChange={(value) => updateLocked('ctaLabel', value)} />
          <label className="block"><span className="label">Recommended plan</span><select className="field" value={draft.locked.recommendedPlan || ''} onChange={(event) => updateLocked('recommendedPlan', event.target.value || null)}><option value="">Automatic</option>{plans.filter((plan) => plan.kind !== 'FREE' && plan.slug !== 'free').map((plan) => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select></label>
          <label className="block"><span className="label">Preview style</span><select className="field" value={draft.locked.presentation} onChange={(event) => updateLocked('presentation', event.target.value)}><option value="BLUR">Blurred skeleton</option><option value="PLACEHOLDER">Placeholder</option><option value="INFORMATION">Information card</option></select></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.locked.visibleWhenLocked} onChange={(event) => updateLocked('visibleWhenLocked', event.target.checked)} />Visible in navigation when locked</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.publicVisible} onChange={(event) => update('publicVisible', event.target.checked)} />Visible on pricing page</label>
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Saving…' : 'Save access rules'}</button>
        </form> : <section className="panel p-5 text-sm text-muted">Select a feature from the matrix to edit its access and presentation.</section>}
      </aside>
    </div>}
  </>;
}

function Field({ label, value, onChange, type = 'text' }) { return <label className="block"><span className="label">{label}</span><input className="field" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function FragmentRows({ category, rows, plans, selected, edit }) {
  const free = plans.find((plan) => plan.kind === 'FREE' || plan.slug === 'free');
  return <><tr><th colSpan={2 + plans.length} className="bg-surface-alt p-2 text-[10px] font-bold uppercase tracking-wider text-muted">{category}</th></tr>{rows.map((feature) => <tr key={feature._id} className={`cursor-pointer border-b border-border hover:bg-hover ${selected === feature.key ? 'bg-selected' : ''}`} onClick={() => edit(feature)}><td className="p-2"><span className="font-semibold">{feature.name}</span><span className="ml-2 text-muted">{feature.scope === 'SECTION' ? 'Section' : 'Feature'}</span></td><td className="p-2">{feature.accessMode || 'PLAN_BASED'}</td>{plans.map((plan) => {
    const entry = plan.features?.find((item) => String(item.feature?._id || item.feature) === String(feature._id));
    const freeEntry = free?.features?.find((item) => String(item.feature?._id || item.feature) === String(feature._id));
    const inherited = plan !== free && freeEntry?.enabled;
    const enabled = feature.status !== 'INACTIVE' && (feature.accessMode === 'FREE' || feature.accessMode !== 'DISABLED' && (Boolean(entry?.enabled) || inherited));
    const limit = entry?.enabled ? entry.limit : freeEntry?.enabled ? freeEntry.limit : null;
    return <td key={plan._id} className={`p-2 text-center font-bold ${enabled ? 'text-success' : 'text-muted'}`}>{enabled ? feature.type === 'LIMIT' && limit != null ? limit : '✓' : '—'}</td>;
  })}</tr>)}</>;
}
