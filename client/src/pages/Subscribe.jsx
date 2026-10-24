import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, CreditCard, MessageCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';
import { formatMoney } from '../utils/format.js';
import { planDuration, planFeature, planName } from '../utils/planDisplay.js';
import { whatsappUrl } from '../marketing/whatsapp.js';

const durationDays = { HOUR: 1 / 24, DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

export default function Subscribe() {
  const { t } = useTranslation();
  const { user, access, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const savedNext = useMemo(() => { try { return sessionStorage.getItem('orbit:registration-next'); } catch { return null; } }, []);
  const continuation = savedNext?.startsWith('/activate/') && !savedNext.includes('\\') && !savedNext.startsWith('//') ? savedNext : null;
  useEffect(() => {
    if (!user) return;
    let live = true;
    Promise.all([api.get('/public/plans'), api.get('/public/config')]).then(([planResponse, configResponse]) => {
      if (!live) return;
      const data = planResponse.data;
      setPlans(Array.isArray(data) ? data : data?.plans || []);
      setConfig(configResponse.data);
    }).catch((failure) => { if (live) setError(failure.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user]);
  useEffect(() => {
    if (!savedNext?.startsWith('/checkout?')) return;
    const planId = new URLSearchParams(savedNext.slice(savedNext.indexOf('?') + 1)).get('plan');
    if (plans.some((plan) => plan.id === planId)) setSelected(planId);
  }, [plans, savedNext]);

  const paidPlans = plans.filter((plan) => plan.kind !== 'FREE' && plan.slug !== 'free' && Number(plan.price?.amount) > 0);
  const recommended = paidPlans.find((plan) => plan.appearance?.highlighted) || [...paidPlans].sort((a, b) => {
    const unitA = a.price.amount / (a.durationValue * (durationDays[a.durationUnit] || 30));
    const unitB = b.price.amount / (b.durationValue * (durationDays[b.durationUnit] || 30));
    return unitA - unitB;
  })[0];
  const chosen = plans.find((plan) => plan.id === selected);
  const ccpConfigured = Boolean(config?.sales?.ccpInstructions?.trim());
  const slickpayConfigured = Boolean(config?.payments?.enabled && chosen?.price?.currency === 'DZD');
  const contactUrl = whatsappUrl(config?.sales, undefined, user?.email);

  async function skip() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api.patch('/me/plan-selection', { status: 'SKIPPED' });
      try { sessionStorage.removeItem('orbit:registration-next'); } catch { /* Storage is optional. */ }
      navigate('/panel', { replace: true });
    } catch (failure) {
      setError(failure.message || t('subscribe:saveError'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (authLoading) return <Spinner />;
  if (!user) return <Navigate to="/login?next=%2Fsubscribe" replace />;
  if (!access?.eligible) return <Navigate to="/access" replace />;
  return <main className="min-h-dvh bg-canvas px-4 pb-32 pt-5 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between"><Link to="/panel" className="inline-flex items-center gap-2 font-display text-xl font-bold"><img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />Orbit</Link><LanguageSelector /></header>
      <section className="mx-auto max-w-xl pb-8 pt-10 text-center sm:pt-14"><h1 className="font-display text-[clamp(2rem,7vw,3rem)] font-bold leading-tight">{t('subscribe:title')}</h1><p className="mt-3 text-base text-muted">{t('subscribe:intro')}</p></section>
      {continuation && <div className="panel mx-auto mb-6 max-w-2xl p-4 text-center"><p className="text-sm text-muted">{t('subscribe:activationReady')}</p><Link to={continuation} onClick={() => { try { sessionStorage.removeItem('orbit:registration-next'); } catch { /* Storage is optional. */ } }} className="btn-secondary mt-3 min-h-12">{t('subscribe:redeemLink')}</Link></div>}
      {error && <p role="alert" className="mx-auto mb-5 max-w-xl rounded-xl bg-danger/10 p-3 text-center text-sm text-danger">{error}</p>}
      {loading ? <Spinner /> : <>
        <div className={`grid gap-4 ${plans.length > 2 ? 'md:grid-cols-3' : 'sm:grid-cols-2'} ${plans.length === 1 ? 'mx-auto max-w-sm sm:grid-cols-1' : ''}`}>
          {plans.map((plan) => {
            const free = plan.kind === 'FREE' || plan.slug === 'free' || Number(plan.price?.amount) === 0;
            return <article key={plan.id} className={`panel relative flex min-w-0 flex-col p-5 ${recommended?.id === plan.id ? 'border-primary ring-2 ring-primary/30' : ''}`}>
              {recommended?.id === plan.id && <span className="mb-3 w-fit rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-text">{t('subscribe:bestValue')}</span>}
              <h2 className="font-display text-xl font-bold">{planName(plan, t)}</h2>
              <p className="mt-3 text-3xl font-bold" dir="ltr">{formatMoney(plan.price?.amount || 0, plan.price?.currency || 'DZD')}</p>
              <p className="mt-1 text-sm text-muted">{free ? t('subscribe:freeForever') : planDuration(plan, t)}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">{(plan.features || []).slice(0, 3).map((feature) => <li key={feature.key} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-primary" /><span>{planFeature(feature, t)}</span></li>)}</ul>
              <button type="button" disabled={busy} aria-pressed={free ? undefined : selected === plan.id} onClick={free ? skip : () => { setSelected(plan.id); setPaymentMethod(null); }} className={`${free ? 'btn-secondary' : 'btn-primary'} mt-6 min-h-12 w-full justify-center`}>{free ? t('subscribe:continueFree') : t('subscribe:choosePlan')}</button>
            </article>;
          })}
        </div>
        {!plans.length && <p className="text-center text-muted">{t('subscribe:noPlans')}</p>}
        {chosen && <section className="panel mx-auto mt-7 max-w-2xl p-5 sm:p-7" aria-live="polite"><h2 className="font-display text-xl font-bold">{t('subscribe:paymentFor', { plan: planName(chosen, t) })}</h2>
          <p className="mt-2 text-sm text-muted">{t('subscribe:verification')}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button type="button" disabled={busy || !ccpConfigured} aria-expanded={paymentMethod === 'ccp'} aria-controls={paymentMethod === 'ccp' ? 'ccp-instructions' : undefined} onClick={() => setPaymentMethod('ccp')} className="btn-secondary min-h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"><CreditCard size={18} /> {t('subscribe:ccpTitle')}</button>
            {slickpayConfigured && !busy ? <Link to={`/checkout?plan=${encodeURIComponent(chosen.id)}`} className="btn-primary min-h-12 w-full justify-center"><CreditCard size={18} /> {t('subscribe:paySlickpay')}</Link> : <button type="button" disabled className="btn-primary min-h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"><CreditCard size={18} /> {t('subscribe:paySlickpay')}</button>}
            {contactUrl && !busy ? <a href={contactUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-12 w-full justify-center"><MessageCircle size={18} /> {t('subscribe:contactTeam')}</a> : <button type="button" disabled className="btn-secondary min-h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"><MessageCircle size={18} /> {t('subscribe:contactTeam')}</button>}
          </div>
          {paymentMethod === 'ccp' && ccpConfigured && <div id="ccp-instructions" className="mt-5 rounded-xl border border-border bg-surface-alt p-4"><h3 className="font-semibold">{t('subscribe:ccpTitle')}</h3><p className="mt-2 whitespace-pre-line text-sm text-muted">{config.sales.ccpInstructions}</p><p className="mt-2 text-xs text-muted">{t('subscribe:ccpReceipt')}</p></div>}
        </section>}
      </>}
    </div>
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"><button type="button" disabled={busy} onClick={skip} className="btn-secondary mx-auto min-h-12 w-full max-w-sm justify-center text-base">{busy ? t('common:saving') : t('subscribe:skip')}</button></div>
  </main>;
}
