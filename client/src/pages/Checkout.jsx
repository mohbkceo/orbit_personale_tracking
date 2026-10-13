import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { meta } from '../analytics/meta.js';
import { analytics } from '../analytics/client.js';
import { GetStartedModal } from '../marketing/GetStartedModal.jsx';
import '../marketing/marketing.css';

export default function Checkout() {
  const { user, loading: authLoading, refresh } = useAuth();
  const [params, setParams] = useSearchParams(); const location = useLocation();
  const planId = params.get('plan'); const orderId = params.get('order');
  const [plan, setPlan] = useState(null); const [order, setOrder] = useState(null);
  const [enabled, setEnabled] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [contact, setContact] = useState(false);
  const [resumeOrderId, setResumeOrderId] = useState(null);
  const closeContact = useCallback(() => setContact(false), []);
  const [billing, setBilling] = useState({ firstname: '', lastname: '', phone: '', address: '' });
  const inFlight = useRef(false); const key = useRef(crypto.randomUUID());
  const confirmedOrder = useRef(null);
  useEffect(() => {
    if (order?.state !== 'PAID' || confirmedOrder.current === order.id) return;
    confirmedOrder.current = order.id;
    meta.event(order.conversion);
    void refresh();
  }, [order, refresh]);
  useEffect(() => {
    if (!user) return;
    let live = true; setLoading(true); setError(''); setResumeOrderId(null);
    Promise.all([api.get('/public/config'), orderId ? api.get(`/payments/orders/${encodeURIComponent(orderId)}`) : api.get('/public/plans')])
      .then(([config, data]) => {
        if (!live) return;
        setEnabled(config.data.payments?.enabled === true);
        if (orderId) { setOrder(data.data); setPlan(data.data.plan); }
        else { setOrder(null); key.current = crypto.randomUUID(); const selected = data.data.find((p) => p.id === planId); setPlan(selected || null); if (!selected) setError('Choose an available plan to continue.'); }
      }).catch((failure) => { if (live) setError(failure.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user, planId, orderId]);
  useEffect(() => {
    if (!user || !orderId || order?.state !== 'PROCESSING' || !order.invoiceId) return;
    let live = true; let attempts = 0; let timer;
    async function poll() {
      try {
        const result = await api.post(`/payments/orders/${orderId}/verify`, {});
        if (!live) return;
        setOrder(result.data);
        if (result.data.state === 'PAID') return;
      } catch (failure) { if (live) setError(failure.message); }
      if (live && ++attempts < 8) timer = setTimeout(poll, 15000);
    }
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [user, orderId, order?.state, order?.invoiceId, refresh]);
  async function verify() {
    setBusy(true); setError('');
    try { const result = await api.post(`/payments/orders/${order.id}/verify`, {}); setOrder(result.data); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError('');
    try { setOrder((await api.post(`/payments/orders/${order.id}/cancel`, {})).data); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function pay(event) {
    event.preventDefault(); if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    let current = order;
    try {
      if (!current) {
        await analytics.session();
        const result = await api.post('/payments/orders', { planId, key: key.current });
        current = result.data.order; setOrder(current); meta.event(result.data.conversion);
        setParams({ order: current.id }, { replace: true });
      }
      const result = await api.post(`/payments/orders/${current.id}/pay`, current.state === 'PROCESSING' ? {} : billing);
      setOrder(result.data.order);
      if (result.data.paymentUrl) window.location.assign(result.data.paymentUrl);
    } catch (failure) {
      setError(failure.message);
      if (failure.code === 'OPEN_ORDER_EXISTS' && /^[a-f\d]{24}$/i.test(failure.errors?.orderId)) setResumeOrderId(failure.errors.orderId);
      // Refresh after an uncertain POST so a second click cannot display a new-pay form.
      if (current?.id) try { setOrder((await api.get(`/payments/orders/${current.id}`)).data); } catch { /* Keep the actionable original error. */ }
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (authLoading) return <Spinner />;
  if (!user) return <Navigate to={`/register?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const paid = order?.state === 'PAID'; const processing = order?.state === 'PROCESSING';
  const terminal = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(order?.state);
  const price = order?.amount ?? plan?.price?.amount;
  return <main className="min-h-screen bg-canvas px-4 py-10"><div className="mx-auto max-w-4xl">
    <Link to="/pricing" className="text-sm text-primary underline">← Back to plans</Link><h1 className="mt-5 font-display text-3xl font-bold">{paid ? 'Your Orbit access is active' : 'Complete your Orbit setup'}</h1>
    {loading ? <Spinner /> : <div className="mt-6 grid gap-6 md:grid-cols-2"><section className="panel p-6"><h2 className="font-display text-2xl font-bold">{plan?.name || 'Select a plan'}</h2>
      {plan && <><p className="mt-2 text-sm text-muted">{plan.durationValue} {plan.durationUnit?.toLowerCase()} access</p><p className="my-5 text-3xl font-bold">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(price || 0)} {order?.currency || plan.price?.currency}</p><ul className="space-y-2 text-sm">{plan.features?.filter((f) => f.enabled !== false).map((f) => <li key={f.key}>✓ {f.type === 'LIMIT' ? `${f.limit} ` : ''}{f.type === 'TEXT' ? f.value : f.name || f.key}</li>)}</ul></>}
      <p className="mt-6 text-xs text-muted">Existing access is extended from its expiry date. Payment is for the displayed period; there are no automatic recurring charges.</p>
      {order && <p className="mt-4 break-all text-xs text-muted">Order {order.id}{order.reference ? ` · Reference ${order.reference}` : ''}</p>}
    </section><section className="panel p-6">
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
      {resumeOrderId && <Link className="btn-secondary mb-4" to={`/checkout?order=${resumeOrderId}`}>Resume unfinished order</Link>}
      {paid ? <><p role="status">Payment verified. Your subscription is ready.</p><Link to="/onboarding" className="btn-primary mt-5">Continue to Orbit</Link></> : processing ? <><h2 className="font-bold">Payment awaiting confirmation</h2><p role="status" className="mt-3 text-sm text-muted">{order.reviewCode ? 'We could not confirm this payment yet. Keep this order reference and contact support if it remains pending.' : 'Orbit will activate access only after SlickPay confirms payment.'}</p><button disabled={busy} onClick={verify} className="btn-primary mt-5">{busy ? 'Checking…' : 'Check payment status'}</button>{order.invoiceId && !order.reviewCode && <form onSubmit={pay}><button disabled={busy || !enabled} className="btn-secondary mt-3">Resume secure payment</button></form>}</> : terminal ? <><p role="status">This order is {order.state.toLowerCase()}. No access was granted by this order.</p><Link className="btn-primary mt-4" to="/pricing">Choose a plan</Link></> : !enabled ? <p role="status">Online payment is currently unavailable. You can arrange access through WhatsApp / COD.</p> : plan && plan.price?.currency !== 'DZD' && !order ? <p>This plan is available through our contact purchase option.</p> : plan && <form onSubmit={pay} className="space-y-4">
        <h2 className="font-bold">Billing details for SlickPay</h2><p className="text-sm text-muted">Your account email is used for billing. Enter card details only on SlickPay’s secure payment page.</p>
        {[['firstname', 'First name', 'given-name'], ['lastname', 'Last name', 'family-name'], ['phone', 'Phone number', 'tel'], ['address', 'Billing address', 'street-address']].map(([field, label, complete]) => <label className="block" key={field}><span className="label">{label}</span><input required className="field" autoComplete={complete} type={field === 'phone' ? 'tel' : 'text'} minLength={field === 'address' ? 5 : undefined} maxLength={field === 'address' ? 300 : field === 'phone' ? 24 : 100} value={billing[field]} onChange={(e) => setBilling({ ...billing, [field]: e.target.value })} /></label>)}
        <button disabled={busy} className="btn-primary w-full justify-center">{busy ? 'Preparing secure payment…' : 'Continue to SlickPay'}</button>
      </form>}
      {order?.state === 'PENDING' && <button disabled={busy} className="mt-4 block text-sm text-primary underline" onClick={cancel}>Cancel unpaid order</button>}
      {!paid && <button className="mt-5 text-sm text-primary underline" onClick={() => setContact(true)}>Contact support / WhatsApp / COD</button>}
    </section></div>}
  </div><GetStartedModal open={contact} onClose={closeContact} /></main>;
}
