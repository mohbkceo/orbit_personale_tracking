import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { meta } from '../analytics/meta.js';
import { analytics } from '../analytics/client.js';
import { GetStartedModal } from '../marketing/GetStartedModal.jsx';
import '../marketing/marketing.css';
import { displayValue, formatMoney } from '../utils/format.js';
import { planDuration, planFeature, planName } from '../utils/planDisplay.js';

export default function Checkout() {
  const { t: _t, i18n } = useTranslation();
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
        else { setOrder(null); key.current = crypto.randomUUID(); const selected = data.data.find((p) => p.id === planId); setPlan(selected || null); if (!selected) setError('planUnavailable'); }
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
    <Link to="/pricing" className="text-sm text-primary underline">{_t('checkout:ui.backToPlans')}</Link><h1 className="mt-5 font-display text-3xl font-bold">{paid ? _t('checkout:ui.yourOrbitAccessIsActive') : _t('checkout:ui.completeYourOrbitSetup')}</h1>
    {loading ? <Spinner /> : <div className="mt-6 grid gap-6 md:grid-cols-2"><section className="panel p-6"><h2 className="font-display text-2xl font-bold">{planName(plan, _t) || _t('checkout:ui.selectAPlan')}</h2>
      {plan && <><p className="mt-2 text-sm text-muted">{planDuration(plan, _t)}</p><p className="my-5 text-3xl font-bold" dir="ltr">{formatMoney(price || 0, order?.currency || plan.price?.currency)}</p><ul className="space-y-2 text-sm">{plan.features?.filter((f) => f.enabled !== false).map((f) => <li key={f.key}>✓ {planFeature(f, _t)}</li>)}</ul></>}
      <p className="mt-6 text-xs text-muted">{_t('checkout:ui.existingAccessIsExtendedFromItsExpiryDatePaymentIsForTheDisplaye')}</p>
      {order && <p className="mt-4 break-all text-xs text-muted">{_t('checkout:ui.order')}{' '}<bdi>{order.id}</bdi>{order.reference ? ` · ${_t('pricing:orderReference', { reference: order.reference })}` : ''}</p>}
    </section><section className="panel p-6">
      {error && <p role="alert" className="mb-4 text-sm text-danger">{error === 'planUnavailable' ? _t('checkout:ui.chooseAnAvailablePlanToContinue') : error}</p>}
      {resumeOrderId && <Link className="btn-secondary mb-4" to={`/checkout?order=${resumeOrderId}`}>{_t('checkout:ui.resumeUnfinishedOrder')}</Link>}
      {paid ? <><p role="status">{_t('checkout:ui.paymentVerifiedYourSubscriptionIsReady')}</p><Link to="/onboarding" className="btn-primary mt-5">{_t('checkout:ui.continueToOrbit')}</Link></> : processing ? <><h2 className="font-bold">{_t('checkout:ui.paymentAwaitingConfirmation')}</h2><p role="status" className="mt-3 text-sm text-muted">{order.reviewCode ? _t('checkout:ui.weCouldNotConfirmThisPaymentYetKeepThisOrderReferenceAndContactS') : _t('checkout:ui.orbitWillActivateAccessOnlyAfterSlickpayConfirmsPayment')}</p><button disabled={busy} onClick={verify} className="btn-primary mt-5">{busy ? _t('checkout:ui.checking') : _t('checkout:ui.checkPaymentStatus')}</button>{order.invoiceId && !order.reviewCode && <form onSubmit={pay}><button disabled={busy || !enabled} className="btn-secondary mt-3">{_t('checkout:ui.resumeSecurePayment')}</button></form>}</> : terminal ? <><p role="status">{_t('pricing:accessState', { state: i18n.resolvedLanguage === 'ar' ? displayValue(order.state.toLowerCase()) : order.state.toLowerCase() })}</p><Link className="btn-primary mt-4" to="/pricing">{_t('checkout:ui.chooseAPlan')}</Link></> : !enabled ? <p role="status">{_t('checkout:ui.onlinePaymentIsCurrentlyUnavailableYouCanArrangeAccessThroughWha')}</p> : plan && plan.price?.currency !== 'DZD' && !order ? <p>{_t('checkout:ui.thisPlanIsAvailableThroughOurContactPurchaseOption')}</p> : plan && <form onSubmit={pay} className="space-y-4">
        <h2 className="font-bold">{_t('checkout:ui.billingDetailsForSlickpay')}</h2><p className="text-sm text-muted">{_t('checkout:ui.yourAccountEmailIsUsedForBillingEnterCardDetailsOnlyOnSlickpaysS')}</p>
        {[['firstname', 'First name', 'given-name'], ['lastname', 'Last name', 'family-name'], ['phone', 'Phone number', 'tel'], ['address', 'Billing address', 'street-address']].map(([field, label, complete]) => <label className="block" key={field}><span className="label">{_t(`checkout:billingFields.${field}`, { defaultValue: label })}</span><input required className="field" autoComplete={complete} type={field === 'phone' ? 'tel' : 'text'} minLength={field === 'address' ? 5 : undefined} maxLength={field === 'address' ? 300 : field === 'phone' ? 24 : 100} value={billing[field]} onChange={(e) => setBilling({ ...billing, [field]: e.target.value })} /></label>)}
        <button disabled={busy} className="btn-primary w-full justify-center">{busy ? _t('checkout:ui.preparingSecurePayment') : _t('checkout:ui.continueToSlickpay')}</button>
      </form>}
      {order?.state === 'PENDING' && <button disabled={busy} className="mt-4 block text-sm text-primary underline" onClick={cancel}>{_t('checkout:ui.cancelUnpaidOrder')}</button>}
      {!paid && <button className="mt-5 text-sm text-primary underline" onClick={() => setContact(true)}>{_t('checkout:ui.contactSupportWhatsappCod')}</button>}
    </section></div>}
  </div><GetStartedModal open={contact} onClose={closeContact} /></main>;
}
