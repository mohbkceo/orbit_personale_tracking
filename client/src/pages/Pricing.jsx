import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

function money(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(amount || 0));
  } catch {
    return `${currency} ${Number(amount || 0)}`;
  }
}

function featureText(feature) {
  if (feature.type === 'LIMIT') {
    return `${feature.limit} ${feature.name}`;
  }

  if (feature.type === 'UNLIMITED') {
    return /^unlimited\b/i.test(feature.name) ? feature.name : `Unlimited ${feature.name}`;
  }

  if (feature.type === 'TEXT') {
    return feature.value || feature.name;
  }

  return feature.name;
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;

  const cleaned = hex.replace('#', '').trim();

  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }

  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => char + char)
          .join('')
      : cleaned;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return `rgba(191,255,0,${alpha})`;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function durationText(plan) {
  if (!plan?.durationValue || !plan?.durationUnit) return '';

  const unit = plan.durationUnit.toLowerCase();
  const plural = Number(plan.durationValue) === 1 ? unit : `${unit}s`;

  return `${plan.durationValue} ${plural} access`;
}

function PricingCard({ plan }) {
  const accent = plan.appearance?.color || '#c8ff00';
  const accentText = plan.appearance?.textColor || '#081000';
  const highlighted = Boolean(plan.appearance?.highlighted);

  const features = Array.isArray(plan.features) ? plan.features : [];

  const primaryFeatures = features.slice(0, 3);
  const remainingFeatures = features.slice(3);

  const ctaText = plan.public?.ctaText || `Get ${plan.name || 'Plan'}`;

  const originalAmount = plan.price?.originalAmount;
  const currentAmount = plan.price?.amount ?? 0;
  const currency = plan.price?.currency || 'USD';

  const discount =
    originalAmount != null && Number(originalAmount) > Number(currentAmount)
      ? Math.round(
          ((Number(originalAmount) - Number(currentAmount)) / Number(originalAmount)) * 100,
        )
      : null;

  return (
    <article
      className={[
        'group relative flex min-w-0 flex-col overflow-hidden rounded-[24px]',
        'border bg-[#151817]',
        'transition-all duration-300',
        highlighted
          ? 'border-white/20 shadow-[0_28px_90px_rgba(0,0,0,0.55)] xl:-translate-y-2'
          : 'border-white/[0.10] hover:border-white/20',
      ].join(' ')}
      style={{
        boxShadow: highlighted
          ? `0 30px 90px rgba(0,0,0,.55), 0 0 0 1px ${rgba(
              accent,
              0.12,
            )}, 0 0 55px ${rgba(accent, 0.09)}`
          : undefined,
      }}
    >
      {/* top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{
          background: `
            radial-gradient(
              circle at 50% -10%,
              ${rgba(accent, highlighted ? 0.34 : 0.2)} 0%,
              ${rgba(accent, 0.1)} 34%,
              transparent 72%
            )
          `,
        }}
      />

      {/* dotted texture */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px] opacity-[0.10]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,.7) 0.7px, transparent 0.7px)',
          backgroundSize: '6px 6px',
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col p-4 sm:p-5">
        {/* PLAN HEADER */}
        <div className="min-h-[92px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[25px] font-black uppercase tracking-[-0.04em] text-white">
                  {plan.name}
                </h2>

                {discount ? (
                  <span
                    className="rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                    style={{
                      backgroundColor: accent,
                      color: accentText,
                    }}
                  >
                    {discount}% off
                  </span>
                ) : null}

                {plan.appearance?.badge ? (
                  <span
                    className="rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                    style={{
                      borderColor: rgba(accent, 0.45),
                      backgroundColor: rgba(accent, 0.13),
                      color: accent,
                    }}
                  >
                    {plan.appearance.badge}
                  </span>
                ) : null}
              </div>

              <p className="mt-1.5 max-w-[300px] text-[13px] leading-5 text-white/60">
                {plan.public?.shortDescription || 'Everything you need to get started.'}
              </p>
            </div>

            {plan.appearance?.icon ? (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: rgba(accent, 0.2),
                  backgroundColor: rgba(accent, 0.1),
                  color: accent,
                }}
              >
                <Icon icon={plan.appearance.icon} width="21" height="21" />
              </div>
            ) : null}
          </div>
        </div>

        {/* FEATURE SUMMARY */}
        <div className="mt-1 rounded-[17px] border border-white/[0.08] bg-white/[0.055] p-3.5 backdrop-blur-xl">
          {primaryFeatures.length ? (
            <div className="space-y-2">
              {primaryFeatures.map((feature, featureIndex) => (
                <div
                  key={feature.key || `${plan.id}-top-${featureIndex}`}
                  className="flex items-start gap-2.5"
                >
                  <div
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                    style={{
                      color: featureIndex === 0 ? accent : 'rgba(255,255,255,.65)',
                    }}
                  >
                    <Icon icon={feature.icon || 'solar:stars-minimalistic-bold'} width="16" />
                  </div>

                  <span
                    className={[
                      'text-[13px] leading-5',
                      featureIndex === 0 ? 'font-bold text-white' : 'font-medium text-white/70',
                    ].join(' ')}
                  >
                    {featureText(feature)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Icon icon="solar:stars-bold-duotone" />
              Plan access included
            </div>
          )}

          <div className="mt-3 border-t border-white/[0.08] pt-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/55">
                <Icon icon="solar:clock-circle-bold-duotone" width="16" />
                Access period
              </div>

              <span className="text-[11px] font-bold text-white/80">{durationText(plan)}</span>
            </div>
          </div>
        </div>

        {/* PRICE */}
        <div className="mt-4 px-1">
          <div className="flex min-h-[58px] items-end gap-2">
            {originalAmount != null && Number(originalAmount) !== Number(currentAmount) ? (
              <span className="mb-1 text-[18px] font-black line-through" style={{ color: accent }}>
                {money(originalAmount, currency)}
              </span>
            ) : null}

            <div className="flex items-end">
              <span className="font-display text-[35px] font-black leading-none tracking-[-0.06em] text-white">
                {money(currentAmount, currency)}
              </span>

              {plan.price?.suffix ? (
                <span className="mb-1 ml-1.5 text-[11px] font-medium text-white/55">
                  {plan.price.suffix}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/login"
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-xl border px-4 text-center text-sm font-black transition duration-200 hover:brightness-110 active:scale-[0.99]"
          style={{
            background: highlighted
              ? `linear-gradient(180deg, ${rgba(accent, 1)} 0%, ${rgba(accent, 0.82)} 100%)`
              : accent,
            borderColor: rgba(accent, 0.9),
            color: accentText,
            boxShadow: `0 5px 0 ${rgba(accent, 0.18)}`,
          }}
        >
          {ctaText}
        </Link>

        {/* LOWER FEATURES */}
        <div className="mt-5 flex-1 rounded-[18px] border border-white/[0.08] bg-[#111412]/80 p-3.5">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <div className="flex items-center gap-2">
              <Icon
                icon="solar:lock-keyhole-minimalistic-bold-duotone"
                width="17"
                className="text-white/75"
              />

              <span className="text-[11px] font-black uppercase tracking-[0.06em] text-white/85">
                Included features
              </span>
            </div>

            <Icon icon="solar:info-circle-linear" width="15" className="text-white/30" />
          </div>

          <div className="divide-y divide-white/[0.06]">
            {(remainingFeatures.length ? remainingFeatures : primaryFeatures).map(
              (feature, featureIndex) => (
                <div
                  key={feature.key || `${plan.id}-feature-${featureIndex}`}
                  className="flex min-h-[45px] items-center gap-2.5 py-2.5"
                >
                  <div
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: rgba(accent, 0.08),
                      color: accent,
                    }}
                  >
                    <Icon icon={feature.icon || 'solar:check-circle-bold'} width="14" />
                  </div>

                  <span className="min-w-0 flex-1 text-[12px] font-medium leading-4 text-white/75">
                    {featureText(feature)}
                  </span>

                  {feature.type === 'UNLIMITED' ? (
                    <span
                      className="shrink-0 rounded-md px-1.5 py-1 text-[9px] font-black uppercase"
                      style={{
                        backgroundColor: rgba(accent, 0.13),
                        color: accent,
                      }}
                    >
                      Unlimited
                    </span>
                  ) : null}

                  {feature.type === 'LIMIT' && feature.limit != null ? (
                    <span className="shrink-0 rounded-md border border-white/[0.09] bg-white/[0.04] px-1.5 py-1 text-[9px] font-bold text-white/60">
                      {feature.limit}
                    </span>
                  ) : null}
                </div>
              ),
            )}
          </div>

          {!features.length ? (
            <div className="py-6 text-center text-xs text-white/35">Features will appear here.</div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;

    api
      .get('/public/plans')
      .then((result) => {
        if (!live) return;

        const data = Array.isArray(result.data) ? result.data : result.data?.plans || [];

        setPlans(data);
      })
      .catch((failure) => {
        if (live) {
          setError(
            failure?.response?.data?.message || failure?.message || 'Unable to load pricing plans.',
          );
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, []);

  const highlightedPlan = useMemo(
    () => plans.find((plan) => plan.appearance?.highlighted),
    [plans],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0d100f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-350px] h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-white/[0.035] blur-[120px]" />

        {highlightedPlan?.appearance?.color ? (
          <div
            className="absolute left-1/2 top-[360px] h-[550px] w-[700px] -translate-x-1/2 rounded-full blur-[160px]"
            style={{
              backgroundColor: rgba(highlightedPlan.appearance.color, 0.055),
            }}
          />
        ) : null}

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.9) .65px, transparent .65px)',
            backgroundSize: '8px 8px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        {/* NAVBAR */}
        <header className="flex h-14 items-center justify-between border-b border-white/[0.06]">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.06]">
              <Icon icon="solar:planet-3-bold-duotone" width="19" />
            </div>

            <span className="font-display text-[19px] font-black tracking-[-0.04em]">Orbit</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-xs font-bold text-white/55 transition hover:text-white sm:block"
            >
              Log in
            </Link>

            <Link
              to="/login"
              className="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2 text-xs font-bold text-white transition hover:bg-white/[0.10]"
            >
              Get started
            </Link>
          </div>
        </header>

        {/* HERO */}
        <section className="pt-14 sm:pt-16">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/40">
              <span className="h-px w-5 bg-white/25" />
              Orbit pricing
            </div>

            <h1 className="font-display text-[38px] font-black leading-[1.02] tracking-[-0.055em] text-white sm:text-[48px]">
              Plans for every workflow
            </h1>

            <p className="mt-3 max-w-xl text-[14px] leading-6 text-white/50 sm:text-[15px]">
              Choose the level of access and features that fits the way you work.
            </p>
          </div>

          {/* CONTROL BAR */}
          <div className="mt-9 flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-fit rounded-xl border border-white/[0.09] bg-white/[0.035] p-1">
              <button
                type="button"
                className="rounded-lg border border-white/[0.09] bg-white/[0.09] px-6 py-2 text-[12px] font-black text-white shadow-sm"
              >
                Available plans
              </button>

              <span className="px-5 py-2 text-[12px] font-medium text-white/35">
                {plans.length || 0} options
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-black/20 px-3.5 py-2.5">
                <Icon icon="solar:question-circle-linear" width="16" className="text-white/45" />

                <span className="text-[11px] font-bold text-white/65">
                  Choose based on the features you need
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CONTENT */}
        <section className="mt-5">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <Spinner />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-500/20 bg-red-500/[0.07] p-6 text-center"
            >
              <Icon
                icon="solar:danger-triangle-bold-duotone"
                width="26"
                className="mx-auto text-red-400"
              />

              <h2 className="mt-3 text-sm font-bold text-white">Unable to load plans</h2>

              <p className="mt-1 text-xs text-white/45">{error}</p>
            </div>
          ) : plans.length ? (
            <div
              className={[
                'grid items-start gap-4',
                plans.length === 1
                  ? 'mx-auto max-w-md'
                  : plans.length === 2
                    ? 'mx-auto max-w-4xl md:grid-cols-2'
                    : 'md:grid-cols-2 xl:grid-cols-3',
              ].join(' ')}
            >
              {plans.map((plan, index) => (
                <PricingCard key={plan.id || plan._id || index} plan={plan} index={index} />
              ))}
            </div>
          ) : (
            <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-white/[0.09] bg-white/[0.035] px-8 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.05] text-white/50">
                <Icon icon="solar:box-minimalistic-linear" width="24" />
              </div>

              <h2 className="mt-4 font-display text-xl font-bold">No plans available</h2>

              <p className="mt-2 text-sm leading-6 text-white/40">
                Pricing plans are currently unavailable.
              </p>
            </div>
          )}
        </section>

        {/* BOTTOM NOTE */}
        {plans.length > 0 && !loading ? (
          <footer className="mt-12 border-t border-white/[0.06] pt-6">
            <div className="flex flex-col gap-4 text-[11px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
              <p>Plan availability, limits and access periods are configured dynamically.</p>

              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Icon icon="solar:shield-check-linear" width="14" />
                  Secure access
                </span>

                <span className="flex items-center gap-1.5">
                  <Icon icon="solar:refresh-circle-linear" width="14" />
                  Configurable plans
                </span>
              </div>
            </div>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
