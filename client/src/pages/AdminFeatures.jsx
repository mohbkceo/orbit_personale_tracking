import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { api } from '../api/client.js';
import { PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import IconPicker from '../components/IconPicker.jsx';

const empty = { key: '', name: '', description: '', category: '', icon: '', type: 'BOOLEAN', publicVisible: true, order: 0, status: 'ACTIVE' };

export default function AdminFeatures() {
  const [features, setFeatures] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function refresh() {
    try { setFeatures((await api.get('/admin/features')).data); setError(''); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  const categories = [...new Set(features.map((feature) => feature.category))].sort();
  const visible = useMemo(() => features.filter((feature) =>
    (status === 'ALL' || feature.status === status) &&
    (category === 'ALL' || feature.category === category) &&
    `${feature.name} ${feature.key} ${feature.description}`.toLowerCase().includes(search.toLowerCase())
  ), [features, search, status, category]);
  async function save(event) {
    event.preventDefault();
    try {
      if (editing) await api.patch(`/admin/features/${editing}`, form);
      else await api.post('/admin/features', form);
      setForm(empty); setEditing(null); await refresh();
    } catch (failure) { setError(failure.message); }
  }
  async function patch(id, changes) {
    try { await api.patch(`/admin/features/${id}`, changes); await refresh(); }
    catch (failure) { setError(failure.message); }
  }
  async function remove(feature) {
    if (!window.confirm(`Delete ${feature.name}? This cannot be undone.`)) return;
    try { await api.delete(`/admin/features/${feature._id}`); if (editing === feature._id) { setEditing(null); setForm(empty); } await refresh(); }
    catch (failure) { setError(failure.message); }
  }
  return <>
    <PageHeader eyebrow="Catalog" title="Features" description="Define the features available to plans and their public presentation." />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={save} className="panel h-fit space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">{editing ? 'Edit feature' : 'Create feature'}</h2>
        <label><span className="label">Name</span><input required className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: editing ? form.key : e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></label>
        <label><span className="label">Key</span><input required className="field" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></label>
        <label><span className="label">Description</span><textarea className="field h-20 py-2" maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label><span className="label">Category</span><input required className="field" list="feature-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /><datalist id="feature-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist></label>
        <label><span className="label">Type</span><select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['BOOLEAN', 'LIMIT', 'UNLIMITED', 'TEXT'].map((type) => <option key={type}>{type}</option>)}</select></label>
        <IconPicker value={form.icon} onChange={(icon) => setForm((current) => ({ ...current, icon }))} label="Feature icon" />
        <div className="grid grid-cols-2 gap-3"><label><span className="label">Display order</span><input type="number" min="0" step="1" className="field" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></label><label><span className="label">Status</span><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.publicVisible} onChange={(e) => setForm({ ...form, publicVisible: e.target.checked })} />Visible on pricing page</label>
        <div className="flex gap-2"><button className="btn-primary">{editing ? 'Save feature' : 'Create feature'}</button>{editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}</div>
      </form>
      <section>
        <div className="mb-3 grid gap-2 sm:grid-cols-3"><input className="field" placeholder="Search features" value={search} onChange={(e) => setSearch(e.target.value)} /><select className="field" value={category} onChange={(e) => setCategory(e.target.value)}><option value="ALL">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select><select className="field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option><option>ACTIVE</option><option>INACTIVE</option></select></div>
        {loading ? <Spinner /> : <div className="space-y-2">{visible.map((feature) => <div key={feature._id} className="panel flex flex-wrap items-center gap-3 p-4 text-sm"><Icon icon={feature.icon} width="25" /><div className="min-w-40 flex-1"><b>{feature.name}</b><p className="text-xs text-[#7a857e]">{feature.key} · {feature.category} · {feature.type} · order {feature.order}</p><p className="text-xs text-[#7a857e]">{feature.description}</p></div><StatusBadge tone={feature.status === 'ACTIVE' ? 'success' : 'warning'}>{feature.status}</StatusBadge><button className="text-accent underline" onClick={() => { setEditing(feature._id); setForm({ key: feature.key, name: feature.name, description: feature.description, category: feature.category, icon: feature.icon, type: feature.type, publicVisible: feature.publicVisible, order: feature.order, status: feature.status }); }}>Edit</button><button className="text-accent underline" onClick={() => patch(feature._id, { status: feature.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}>{feature.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button><button className="text-red-600 underline" onClick={() => remove(feature)}>Delete</button><button className="text-accent underline" title="Move earlier" aria-label={`Move ${feature.name} earlier`} disabled={feature.order === 0} onClick={() => patch(feature._id, { order: Math.max(0, feature.order - 1) })}>↑</button><button className="text-accent underline" title="Move later" aria-label={`Move ${feature.name} later`} onClick={() => patch(feature._id, { order: feature.order + 1 })}>↓</button></div>)}{!visible.length && <div className="panel p-6 text-sm text-[#7a857e]">No features found.</div>}</div>}
      </section>
    </div>
  </>;
}
