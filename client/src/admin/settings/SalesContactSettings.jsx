import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Spinner } from '../../components/ui.jsx';

const empty = { whatsappNumber: '', whatsappMessage: '', salesEmail: '', supportEmail: '', phoneNumber: '', whatsappEnabled: true, contactVisible: false };

export default function SalesContactSettings() {
  const [sales, setSales] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/settings').then((response) => setSales({ ...empty, ...response.data.sales })).catch((failure) => setError(failure.message)).finally(() => setLoading(false)); }, []);
  function change(key, value) { setSales((current) => ({ ...current, [key]: value })); setSaved(false); }
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { const response = await api.put('/admin/settings/sales', sales); setSales({ ...empty, ...response.data }); setSaved(true); }
    catch (failure) { setError(Object.values(failure.errors || {}).flat().join(' · ') || failure.message); }
    finally { setSaving(false); }
  }
  if (loading) return <Spinner label="Loading contact settings…" />;
  return <div className="min-w-0"><header className="mb-5"><h2 className="font-display text-xl font-bold">Sales / Contact</h2><p className="mt-1 text-sm text-muted">Contact details and visibility on public sales pages.</p></header>
    {error && <p role="alert" className="mb-4 break-words rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={save} className="space-y-5">
      <section className="panel space-y-4 p-5"><div><h3 className="font-display text-base font-bold">Sales contact</h3><p className="mt-1 text-xs text-muted">Use an international WhatsApp number. Leave it blank to make the link unavailable.</p></div>
        <label className="block"><span className="label">WhatsApp number</span><input className="field" type="tel" autoComplete="tel" maxLength={40} value={sales.whatsappNumber} onChange={(event) => change('whatsappNumber', event.target.value)} placeholder="+213…" /></label>
        <label className="block"><span className="label">Default WhatsApp message</span><textarea className="field h-28 py-3" maxLength={1000} value={sales.whatsappMessage} onChange={(event) => change('whatsappMessage', event.target.value)} /></label>
      </section>
      <section className="panel space-y-4 p-5"><h3 className="font-display text-base font-bold">Contact information</h3><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Sales email</span><input className="field" type="email" maxLength={254} value={sales.salesEmail} onChange={(event) => change('salesEmail', event.target.value)} /></label><label><span className="label">Support email</span><input className="field" type="email" maxLength={254} value={sales.supportEmail} onChange={(event) => change('supportEmail', event.target.value)} /></label></div><label className="block"><span className="label">Phone number</span><input className="field" type="tel" maxLength={40} value={sales.phoneNumber} onChange={(event) => change('phoneNumber', event.target.value)} /></label></section>
      <section className="panel space-y-4 p-5"><h3 className="font-display text-base font-bold">Public sales options</h3><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={sales.whatsappEnabled} onChange={(event) => change('whatsappEnabled', event.target.checked)} /><span>Enable WhatsApp sales CTA</span></label><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={sales.contactVisible} onChange={(event) => change('contactVisible', event.target.checked)} /><span>Show public contact information</span></label></section>
      <div className="flex flex-wrap items-center justify-end gap-3"><span role="status" className="text-sm text-success">{saved ? 'Saved' : ''}</span><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </div>;
}
