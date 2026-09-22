import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { api } from '../api/client.js';
import { PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import IconPicker from '../components/IconPicker.jsx';

const empty = () => ({
  name: '', slug: '', description: '', durationValue: 3, durationUnit: 'MONTH',
  price: { amount: 0, originalAmount: null, currency: 'USD', suffix: '' },
  appearance: { icon: '', color: '#173d30', textColor: '#ffffff', badge: '', highlighted: false },
  public: { visible: false, order: 0, ctaText: 'Get started', shortDescription: '' },
  features: [], status: 'ACTIVE',
});
const field = (label, value, onChange, props = {}) => <label><span className="label">{label}</span><input className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props} /></label>;
function Section({ title, children }) { return <fieldset className="space-y-3 border-t border-black/10 pt-5 dark:border-white/10"><legend className="font-display text-lg font-bold">{title}</legend>{children}</fieldset>; }

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const [planResult, featureResult] = await Promise.all([api.get('/admin/plans'), api.get('/admin/features')]);
      setPlans(planResult.data); setCatalog(featureResult.data); setError('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  const update = (part, key, value) => setForm((current) => ({ ...current, [part]: { ...current[part], [key]: value } }));
  const entitlement = (feature) => form.features.find((entry) => entry.feature === feature._id);
  function setEntitlement(feature, changes) {
    setForm((current) => {
      const before = current.features.find((entry) => entry.feature === feature._id);
      const next = { feature: feature._id, enabled: true, ...(feature.type === 'LIMIT' ? { limit: 0 } : {}), ...(feature.type === 'TEXT' ? { value: '' } : {}), ...before, ...changes };
      return { ...current, features: before ? current.features.map((entry) => entry.feature === feature._id ? next : entry) : [...current.features, next] };
    });
  }
  async function save(event) {
    event.preventDefault();
    try {
      const payload = { ...form, slug: form.slug || form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), price: { ...form.price, originalAmount: form.price.originalAmount === '' ? null : form.price.originalAmount } };
      if (editing) await api.patch(`/admin/plans/${editing}`, payload);
      else await api.post('/admin/plans', payload);
      setForm(empty()); setEditing(null); await refresh();
    } catch (failure) { setError(failure.message); }
  }
  async function toggle(plan) {
    try { await api.patch(`/admin/plans/${plan._id}`, { status: plan.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }); await refresh(); }
    catch (failure) { setError(failure.message); }
  }
  function edit(plan) {
    setEditing(plan._id);
    setForm({ name: plan.name, slug: plan.slug || plan.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), description: plan.description || '', durationValue: plan.durationValue, durationUnit: plan.durationUnit,
      price: { amount: plan.price?.amount ?? 0, originalAmount: plan.price?.originalAmount ?? null, currency: plan.price?.currency || 'USD', suffix: plan.price?.suffix || '' },
      appearance: { icon: plan.appearance?.icon || '', color: plan.appearance?.color || '#173d30', textColor: plan.appearance?.textColor || '#ffffff', badge: plan.appearance?.badge || '', highlighted: !!plan.appearance?.highlighted },
      public: { visible: !!plan.public?.visible, order: plan.public?.order ?? 0, ctaText: plan.public?.ctaText || 'Get started', shortDescription: plan.public?.shortDescription || '' },
      features: (plan.features || []).filter((entry) => entry.feature?._id).map((entry) => ({ feature: entry.feature._id, enabled: entry.enabled, ...(entry.feature.type === 'LIMIT' ? { limit: entry.limit ?? 0 } : {}), ...(entry.feature.type === 'TEXT' ? { value: entry.value || '' } : {}) })), status: plan.status });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  return <>
    <PageHeader eyebrow="Access" title="Plans" description="Configure duration, pricing, appearance, and catalog features." />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,540px)_1fr]">
      <form onSubmit={save} className="panel h-fit space-y-6 p-5">
        <h2 className="font-display text-xl font-bold">{editing ? 'Edit plan' : 'Create plan'}</h2>
        <Section title="Basic">
          {field('Name', form.name, (name) => setForm({ ...form, name, slug: editing ? form.slug : name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }), { required: true })}
          {field('Slug', form.slug, (slug) => setForm({ ...form, slug }), { required: true, pattern: '[a-z0-9]+(-[a-z0-9]+)*' })}
          <label><span className="label">Description</span><textarea className="field h-20 py-2" maxLength="500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label><span className="label">Status</span><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>ACTIVE</option><option>INACTIVE</option></select></label>
        </Section>
        <Section title="Duration"><div className="grid grid-cols-2 gap-3">{field('Duration', form.durationValue, (value) => setForm({ ...form, durationValue: Number(value) }), { type: 'number', min: 1, step: 1, required: true })}<label><span className="label">Unit</span><select className="field" value={form.durationUnit} onChange={(e) => setForm({ ...form, durationUnit: e.target.value })}>{['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'].map((unit) => <option key={unit}>{unit}</option>)}</select></label></div></Section>
        <Section title="Pricing"><div className="grid grid-cols-2 gap-3">{field('Price', form.price.amount, (value) => update('price', 'amount', Number(value)), { type: 'number', min: 0, step: '0.01', required: true })}{field('Original price', form.price.originalAmount, (value) => update('price', 'originalAmount', value === '' ? null : Number(value)), { type: 'number', min: 0, step: '0.01' })}{field('Currency', form.price.currency, (value) => update('price', 'currency', value.toUpperCase()), { maxLength: 3, required: true })}{field('Price suffix', form.price.suffix, (value) => update('price', 'suffix', value), { placeholder: '/ month', maxLength: 40 })}</div></Section>
        <Section title="Appearance"><IconPicker value={form.appearance.icon} onChange={(icon) => update('appearance', 'icon', icon)} label="Plan icon" /><div className="grid grid-cols-2 gap-3">{field('Plan color', form.appearance.color, (value) => update('appearance', 'color', value), { type: 'color' })}{field('Text color', form.appearance.textColor, (value) => update('appearance', 'textColor', value), { type: 'color' })}</div>{field('Badge', form.appearance.badge, (value) => update('appearance', 'badge', value), { maxLength: 60 })}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.appearance.highlighted} onChange={(e) => update('appearance', 'highlighted', e.target.checked)} />Highlight card</label></Section>
        <Section title="Pricing Page"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.public.visible} onChange={(e) => update('public', 'visible', e.target.checked)} />Show publicly</label><div className="grid grid-cols-2 gap-3">{field('Display order', form.public.order, (value) => update('public', 'order', Number(value)), { type: 'number', min: 0, step: 1 })}{field('CTA text', form.public.ctaText, (value) => update('public', 'ctaText', value), { required: true, maxLength: 80 })}</div>{field('Short description', form.public.shortDescription, (value) => update('public', 'shortDescription', value), { maxLength: 240 })}</Section>
        <Section title="Features">{catalog.length ? <div className="space-y-3">{catalog.map((feature) => {
          const entry = entitlement(feature);
          return <div key={feature._id} className="rounded-xl border border-[#dde2dc] p-3 dark:border-white/10"><div className="flex items-center gap-2"><Icon icon={feature.icon} width="21" /><div className="flex-1"><b className="text-sm">{feature.name}</b><p className="text-xs text-[#7a857e]">{feature.category} · {feature.type}{feature.status === 'INACTIVE' ? ' · inactive' : ''}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!entry?.enabled} onChange={(e) => setEntitlement(feature, { enabled: e.target.checked })} />Enabled</label></div>{entry?.enabled && feature.type === 'LIMIT' && <div className="mt-3">{field('Numeric limit', entry.limit ?? 0, (value) => setEntitlement(feature, { limit: Number(value) }), { type: 'number', min: 0, step: 1, required: true })}</div>}{entry?.enabled && feature.type === 'TEXT' && <div className="mt-3">{field('Displayed text', entry.value || '', (value) => setEntitlement(feature, { value }), { maxLength: 240, required: true })}</div>}</div>;
        })}</div> : <p className="text-sm text-[#7a857e]">Create features in the catalog to configure entitlements.</p>}</Section>
        <div className="flex gap-2"><button className="btn-primary">{editing ? 'Save plan' : 'Create plan'}</button>{editing && <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setForm(empty()); }}>Cancel</button>}</div>
      </form>
      <section className="space-y-3">{loading ? <Spinner /> : plans.length ? plans.map((plan) => <div key={plan._id} className="panel flex flex-wrap items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl text-lg" style={{ backgroundColor: plan.appearance?.color, color: plan.appearance?.textColor }}>{plan.appearance?.icon && <Icon icon={plan.appearance.icon} />}</span><div className="min-w-40 flex-1"><b>{plan.name}</b><p className="text-xs text-[#7a857e]">{plan.durationValue} {plan.durationUnit.toLowerCase()}{plan.durationValue === 1 ? '' : 's'} · {plan.price?.currency} {plan.price?.amount ?? 0} · {plan.public?.visible ? 'Public' : 'Hidden'} · order {plan.public?.order ?? 0}</p></div><StatusBadge tone={plan.status === 'ACTIVE' ? 'success' : 'warning'}>{plan.status}</StatusBadge><button className="text-xs text-accent underline" onClick={() => edit(plan)}>Edit</button><button className="text-xs text-accent underline" onClick={() => toggle(plan)}>{plan.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div>) : <div className="panel p-6 text-sm text-[#7a857e]">No plans yet.</div>}</section>
    </div>
  </>;
}
