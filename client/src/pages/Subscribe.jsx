import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';
import { formatMoney } from '../utils/format.js';
import { planDuration, planFeature, planName } from '../utils/planDisplay.js';
import { whatsappUrl } from '../marketing/whatsapp.js';

const DURATION_DAYS = { HOUR: 1 / 24, DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#242424]';

// Defaults work immediately in both supported UI languages. Add these keys to
// the subscribe namespace later if you want copy to be managed from locale files.
const EXTRA_COPY = {
  en: {
    planStep: 'Choose your plan',
    paymentStep: 'Choose how to pay',
    selected: 'Continue to payment',
    selectedPlan: 'Your plan',
    selectPlan: 'Choose this plan',
    transferHelp: 'Transfer details',
    paymentUnavailable:
      'Payment options are temporarily unavailable. You can continue free and upgrade later.',
    freePrompt: 'Just want to explore first?',
    openCheckout: 'Pay online',
    whatsappOption: 'Talk to our team',
  },
  ar: {
    planStep: 'اختَر اشتراكك',
    paymentStep: 'اختَر طريقة الدفع',
    selected: 'المتابعة إلى الدفع',
    selectedPlan: 'اشتراكك',
    selectPlan: 'اختيار هذا الاشتراك',
    transferHelp: 'معلومات التحويل',
    paymentUnavailable: 'طرق الدفع غير متاحة مؤقتًا. يمكنك المتابعة مجانًا والترقية لاحقًا.',
    freePrompt: 'تحب تجرّب أولاً؟',
    openCheckout: 'الدفع الإلكتروني',
    whatsappOption: 'تواصل مع الفريق',
  },
};

const isFreePlan = (plan) =>
  plan.kind === 'FREE' || plan.slug === 'free' || Number(plan.price?.amount) === 0;

function pricePerDay(plan) {
  const amount = Number(plan.price?.amount);
  const duration = Number(plan.durationValue) * (DURATION_DAYS[plan.durationUnit] || 0);
  return Number.isFinite(amount) && amount > 0 && Number.isFinite(duration) && duration > 0
    ? amount / duration
    : Infinity;
}

function PlanCard({ plan, selected, recommended, t, copy, busy, onSelect }) {
  const features = (plan.features || []).slice(0, 3);
  const currency = plan.price?.currency || 'DZD';

  return (
    <article
      className={`group relative flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[28px] border p-5 transition-colors sm:p-6 ${
        selected
          ? 'border-[#242424] bg-white shadow-xs'
          : 'border-[#E7E9EF] bg-white/75 hover:border-[#C8CED8]'
      }`}
    >
      {recommended && (
        <div
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#C9DFFE,#DCD0FF,#FCE6D8)]"
          aria-hidden="true"
        />
      )}
      <div className="flex min-h-6 items-center justify-between gap-3">
        {recommended ? (
          <span className="rounded-full bg-[#F1F0FF] px-3 py-1 text-[11px] font-bold tracking-[0.01em] text-[#4A438B]">
            {t('subscribe:bestValue')}
          </span>
        ) : (
          <span aria-hidden="true" />
        )}
        <span
          className={`grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full border transition-colors ${
            selected
              ? 'border-[#242424] bg-[#242424] text-white'
              : 'border-[#D4D7DE] bg-white text-transparent'
          }`}
          aria-hidden="true"
        >
          <Check size={13} strokeWidth={3} />
        </span>
      </div>

      <h3 className="mt-4 text-[19px] font-bold tracking-[-0.035em] text-[#1C1C1E]">
        {planName(plan, t)}
      </h3>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          className="text-[clamp(1.85rem,5vw,2.35rem)] font-extrabold tracking-[-0.05em] text-[#151517]"
          dir="ltr"
        >
          {formatMoney(plan.price?.amount || 0, currency)}
        </span>
      </div>
      <p className="mt-1 text-[13px] font-medium text-[#7C7C86]">{planDuration(plan, t)}</p>

      {features.length > 0 && (
        <ul className="mt-5 flex-1 space-y-3 border-t border-[#EFEFF2] pt-5">
          {features.map((feature, index) => (
            <li
              key={feature.key || index}
              className="flex items-start gap-2.5 text-[13px] leading-5 text-[#3D3D45]"
            >
              <Check
                size={16}
                className="mt-0.5 shrink-0 text-[#4F8268]"
                strokeWidth={2.2}
                aria-hidden="true"
              />
              <span>{planFeature(feature, t)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Visual CTA: the entire plan card is the actual button. */}
      <div
        aria-hidden="true"
        className={`mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[17px] px-4 text-sm font-semibold transition-colors ${
          selected
            ? 'bg-[#1C1C1E] text-white group-hover:bg-black'
            : 'border border-[#E6E7EB] bg-[#F5F5F7] text-[#25252A] group-hover:bg-[#EDEDF0]'
        }`}
      >
        {selected ? copy('selected') : copy('selectPlan')}
        {!selected && <ArrowRight size={16} className="rtl-flip" aria-hidden="true" />}
      </div>

      <button
        type="button"
        disabled={busy}
        aria-pressed={selected}
        aria-label={`${selected ? copy('selected') : copy('selectPlan')}: ${planName(plan, t)}`}
        onClick={() => onSelect(plan.id)}
        className={`absolute inset-0 z-10 h-full w-full rounded-[28px] bg-transparent disabled:cursor-not-allowed ${focusRing}`}
      />
    </article>
  );
}

function PaymentAction({ icon, title, subtitle, children, variant = 'default', ...props }) {
  const classes = `group flex min-h-[72px] w-full items-center gap-3 rounded-[20px] border px-4 py-3 text-start transition-colors ${focusRing} ${
    variant === 'primary'
      ? 'border-[#242424] bg-[#242424] text-white hover:bg-[#111111]'
      : 'border-[#E8E9EE] bg-[#FBFBFC] text-[#222228] hover:border-[#C8CED8] hover:bg-[#F6F7FA]'
  }`;
  // Preserve the semantic control supplied by the caller (button or link).
  const content = (
    <>
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[15px] text-xl ${variant === 'primary' ? 'bg-white/15' : 'bg-white'}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">{title}</span>
        {subtitle && (
          <span
            className={`mt-0.5 block text-xs ${variant === 'primary' ? 'text-white/70' : 'text-[#7E7E87]'}`}
          >
            {subtitle}
          </span>
        )}
      </span>
      <ArrowRight size={17} className="rtl-flip shrink-0 opacity-60" aria-hidden="true" />
    </>
  );
  if (props.to)
    return (
      <Link {...props} className={classes}>
        {content}
      </Link>
    );
  if (props.href)
    return (
      <a {...props} className={classes}>
        {content}
      </a>
    );
  return (
    <button type="button" {...props} className={classes}>
      {children || content}
    </button>
  );
}

export default function Subscribe() {
  const { t, i18n } = useTranslation();
  const { user, access, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isArabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');
  const copy = (key) =>
    t(`subscribe:${key}`, { defaultValue: EXTRA_COPY[isArabic ? 'ar' : 'en'][key] });

  const [plans, setPlans] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const paymentRef = useRef(null);

  const savedNext = useMemo(() => {
    try {
      return sessionStorage.getItem('orbit:registration-next');
    } catch {
      return null;
    }
  }, []);
  const continuation =
    savedNext?.startsWith('/activate/') && !savedNext.includes('\\') && !savedNext.startsWith('//')
      ? savedNext
      : null;

  useEffect(() => {
    if (!user?.id) return undefined;
    let live = true;
    setLoading(true);
    Promise.allSettled([api.get('/public/plans'), api.get('/public/config')])
      .then(([plansResult, configResult]) => {
        if (!live) return;
        if (plansResult.status === 'fulfilled') {
          const data = plansResult.value.data;
          setPlans(Array.isArray(data) ? data : Array.isArray(data?.plans) ? data.plans : []);
        } else {
          setError(plansResult.reason?.message || t('subscribe:saveError'));
        }
        if (configResult.status === 'fulfilled') {
          setConfig(configResult.value.data);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user?.id, t]);

  const paidPlans = useMemo(
    () => plans.filter((plan) => !isFreePlan(plan) && Number(plan.price?.amount) > 0),
    [plans],
  );
  const freePlan = useMemo(() => plans.find(isFreePlan), [plans]);
  const recommended = useMemo(() => {
    const highlighted = paidPlans.find((plan) => plan.appearance?.highlighted);
    if (highlighted) return highlighted;
    if (!paidPlans.length) return null;
    const currencies = new Set(paidPlans.map((plan) => plan.price?.currency || 'DZD'));
    if (currencies.size > 1) return null; // Never compare unlike currencies.
    return [...paidPlans].sort((a, b) => pricePerDay(a) - pricePerDay(b))[0];
  }, [paidPlans]);

  useEffect(() => {
    if (!paidPlans.length) return;
    setSelected((previous) => {
      if (paidPlans.some((plan) => plan.id === previous)) return previous;
      let savedPlan = null;
      if (savedNext?.startsWith('/checkout?')) {
        const savedId = new URLSearchParams(savedNext.slice(savedNext.indexOf('?') + 1)).get(
          'plan',
        );
        savedPlan = paidPlans.find((plan) => String(plan.id) === savedId);
      }
      return (savedPlan || recommended || paidPlans[0]).id;
    });
  }, [paidPlans, recommended, savedNext]);

  const chosen = paidPlans.find((plan) => plan.id === selected) || null;
  const ccpConfigured = Boolean(config?.sales?.ccpInstructions?.trim());
  const slickpayConfigured = Boolean(
    config?.payments?.enabled && chosen?.price?.currency === 'DZD',
  );
  const contactUrl = whatsappUrl(config?.sales, undefined, user?.email);
  const hasPaymentMethods = ccpConfigured || slickpayConfigured || Boolean(contactUrl);

  function choosePlan(id) {
    if (busy) return;
    setSelected(id);
    setPaymentMethod(null);
    paymentRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  async function skip() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await api.patch('/me/plan-selection', { status: 'SKIPPED' });
      try {
        sessionStorage.removeItem('orbit:registration-next');
      } catch {
        /* Optional storage. */
      }
      navigate('/panel', { replace: true });
    } catch (failure) {
      setError(failure?.message || t('subscribe:saveError'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (authLoading) return <Spinner />;
  if (!user) return <Navigate to="/login?next=%2Fsubscribe" replace />;
  if (!access?.eligible) return <Navigate to="/access" replace />;

  return (
    <main
      dir={isArabic ? 'rtl' : 'ltr'}
      className="relative isolate min-h-dvh overflow-x-hidden bg-[#FAFAFC] text-[#202024]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[470px] bg-[radial-gradient(ellipse_at_49%_0%,#E7EFFD_0%,#F4F2FE_40%,#FAFAFC_78%)]"
      />

      <div className="mx-auto w-full max-w-[980px] px-4 pb-8 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5">
            <img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-[20px] font-extrabold tracking-[-0.04em]">
              Orbit
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={skip}
              className={`min-h-10 rounded-xl px-3 text-[13px] font-semibold text-[#747480] transition-colors hover:bg-white/70 hover:text-[#292930] disabled:opacity-50 ${focusRing}`}
            >
              {busy ? t('common:saving') : t('subscribe:skip')}
            </button>
            <LanguageSelector />
          </div>
        </header>

        <div className="mx-auto max-w-[650px] pb-8 pt-10 text-center sm:pb-10 sm:pt-14">
          <h1 className="font-display text-[clamp(2rem,6vw,3.1rem)] font-extrabold leading-[1.12] tracking-[-0.055em]">
            {t('subscribe:title')}
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-7 text-[#696975] sm:text-base">
            {t('subscribe:intro')}
          </p>
        </div>

        {continuation && (
          <section className="mx-auto mb-6 flex max-w-[780px] flex-col items-start justify-between gap-3 rounded-[20px] border border-[#DAE5FC] bg-white/75 p-4 sm:flex-row sm:items-center sm:px-5">
            <p className="text-sm font-medium text-[#4E5870]">{t('subscribe:activationReady')}</p>
            <Link
              to={continuation}
              onClick={() => {
                try {
                  sessionStorage.removeItem('orbit:registration-next');
                } catch {
                  /* Optional storage. */
                }
              }}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-[14px] bg-[#242424] px-4 text-sm font-semibold text-white ${focusRing}`}
            >
              {t('subscribe:redeemLink')}
            </Link>
          </section>
        )}

        {error && (
          <p
            role="alert"
            className="mx-auto mb-6 max-w-[780px] rounded-[15px] border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {loading ? (
          <div className="py-16">
            <Spinner />
          </div>
        ) : (
          <>
            <section aria-labelledby="plan-heading" className="mx-auto max-w-[850px]">
              <h2
                id="plan-heading"
                className="mb-4 text-[17px] font-bold tracking-[-0.03em] sm:mb-5 sm:text-[19px]"
              >
                {copy('planStep')}
              </h2>
              {paidPlans.length > 0 ? (
                <div
                  className={`grid gap-3 sm:gap-4 ${paidPlans.length === 1 ? 'mx-auto max-w-[440px]' : paidPlans.length === 2 ? 'md:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}
                >
                  {paidPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      selected={selected === plan.id}
                      recommended={paidPlans.length > 1 && recommended?.id === plan.id}
                      t={t}
                      copy={copy}
                      busy={busy}
                      onSelect={choosePlan}
                    />
                  ))}
                </div>
              ) : !freePlan ? (
                <p className="rounded-[20px] border border-[#ECECF0] bg-white px-5 py-8 text-center text-sm text-[#777780]">
                  {t('subscribe:noPlans')}
                </p>
              ) : null}
            </section>

            {chosen && (
              <section
                ref={paymentRef}
                aria-labelledby="payment-heading"
                className="mx-auto mt-7 max-w-[650px] scroll-mt-6 rounded-[26px] border border-[#EAEAEA] bg-white p-5 sm:p-7"
              >
                {/* Heading */}
                <h2
                  id="payment-heading"
                  className="text-[22px] font-bold tracking-tight text-[#18181B]"
                >
                  {copy('paymentStep')}
                </h2>

                {/* Selected plan — compact summary */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F7F7F8] px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#202024]">
                      {planName(chosen, t)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[#85858D]">{planDuration(chosen, t)}</p>
                  </div>

                  <strong className="text-[19px] font-bold tracking-tight text-[#18181B]" dir="ltr">
                    {formatMoney(chosen.price?.amount || 0, chosen.price?.currency || 'DZD')}
                  </strong>
                </div>

                {/* Payment methods */}
                <div className="mt-5 flex flex-col gap-2.5">
                  {slickpayConfigured && (
                    <PaymentAction
                      icon="💳"
                      title={t('subscribe:paySlickpay')}
                      variant="primary"
                      to={`/checkout?plan=${encodeURIComponent(chosen.id)}`}
                    />
                  )}

                  {ccpConfigured && (
                    <PaymentAction
                      icon="🏦"
                      title={t('subscribe:ccpTitle')}
                      onClick={() => setPaymentMethod((value) => (value === 'ccp' ? null : 'ccp'))}
                      aria-expanded={paymentMethod === 'ccp'}
                      aria-controls="ccp-instructions"
                    />
                  )}

                  {contactUrl && (
                    <PaymentAction
                      icon="💬"
                      title={t('subscribe:contactTeam')}
                      variant={!slickpayConfigured ? 'primary' : 'default'}
                      href={contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  )}
                </div>

                {/* CCP instructions — expanded only when selected */}
                {paymentMethod === 'ccp' && ccpConfigured && (
                  <div id="ccp-instructions" className="mt-3 rounded-2xl bg-[#F7F8FA] p-4">
                    <p
                      className="whitespace-pre-line break-words text-[14px] leading-7 text-[#45454D]"
                      dir="auto"
                    >
                      {config.sales.ccpInstructions}
                    </p>

                    <p className="mt-4 border-t border-[#E5E5E9] pt-3 text-[12px] leading-5 text-[#777780]">
                      {t('subscribe:ccpReceipt')}
                    </p>
                  </div>
                )}

                {/* No available methods */}
                {!hasPaymentMethods && (
                  <p className="mt-4 rounded-2xl bg-[#F7F7F8] p-4 text-sm text-[#666670]">
                    {copy('paymentUnavailable')}
                  </p>
                )}
              </section>
            )}

            {freePlan && (
              <div className="mx-auto mt-6 flex max-w-[850px] flex-col items-center justify-between gap-3 rounded-[20px] border border-[#E9E9EE] bg-white/65 px-5 py-4 sm:flex-row">
                <div className="text-center sm:text-start">
                  <p className="text-[13px] text-[#7B7B86]">{copy('freePrompt')}</p>
                  <p className="mt-0.5 text-[14px] font-bold text-[#292930]">
                    {planName(freePlan, t)} · {t('subscribe:freeForever')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={skip}
                  className={`min-h-[44px] w-full shrink-0 rounded-[13px] border border-[#E4E5EB] bg-white px-5 text-sm font-semibold text-[#3F414B] hover:bg-[#F6F7FA] disabled:opacity-50 sm:w-auto ${focusRing}`}
                >
                  {busy ? t('common:saving') : t('subscribe:continueFree')}
                </button>
              </div>
            )}
          </>
        )}

        <footer className="mx-auto mt-8 flex max-w-[850px] justify-center border-t border-[#EBECF0] pt-6">
          <button
            type="button"
            disabled={busy}
            onClick={skip}
            className={`min-h-[48px] rounded-[14px] px-6 text-[14px] font-semibold text-[#777783] underline-offset-4 transition-colors hover:bg-white hover:text-[#292930] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            {busy ? t('common:saving') : t('subscribe:skip')}
          </button>
        </footer>
      </div>
    </main>
  );
}
