import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner } from '../components/ui.jsx';

function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toLocaleString()}`; }
}
function featureText(feature) {
  if (feature.type === 'LIMIT') return `${feature.limit} ${feature.name}`;
  if (feature.type === 'UNLIMITED') return /^unlimited\b/i.test(feature.name) ? feature.name : `Unlimited ${feature.name}`;
  if (feature.type === 'TEXT') return feature.value || feature.name;
  return feature.name;
}

export default function Pricing() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api.get('/public/plans').then((result) => { if (live) setPlans(result.data); }).catch((failure) => { if (live) setError(failure.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  return <main className="min-h-screen bg-canvas px-4 py-8 dark:bg-[#0d1310] sm:py-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex items-center justify-between"><Link className="font-display text-2xl font-bold" to="/">Orbit</Link><Link className="btn-secondary" to="/login">Log in</Link></header>
      <div className="mx-auto max-w-2xl py-12 text-center"><p className="eyebrow">Orbit pricing</p><h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">Choose your plan</h1><p className="mt-4 text-[#6f7b73]">Find the access period and features that fit your work.</p></div>
      {loading ? <Spinner /> : error ? <div role="alert" className="panel mx-auto max-w-xl p-6 text-center text-red-700">{error}</div> : plans.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <article key={plan.id} className={`panel flex flex-col overflow-hidden ${plan.appearance?.highlighted ? 'ring-2 ring-accent shadow-xl' : ''}`}>
        <div className="p-6" style={{ backgroundColor: plan.appearance?.color, color: plan.appearance?.textColor }}>
          <div className="flex items-start justify-between gap-3"><span className="text-3xl">{plan.appearance?.icon && <Icon icon={plan.appearance.icon} />}</span>{plan.appearance?.badge && <span className="rounded-full border border-current/30 px-3 py-1 text-xs font-bold">{plan.appearance.badge}</span>}</div>
          <h2 className="mt-5 font-display text-2xl font-bold">{plan.name}</h2><p className="mt-2 min-h-10 text-sm opacity-80">{plan.public?.shortDescription}</p>
        </div>
        <div className="flex flex-1 flex-col p-6"><div>{plan.price?.originalAmount != null && <p className="text-sm text-[#7a857e] line-through">{money(plan.price.originalAmount, plan.price.currency)}</p>}<p className="font-display text-4xl font-bold">{money(plan.price?.amount ?? 0, plan.price?.currency || 'USD')}<span className="ml-1 font-sans text-base font-normal text-[#7a857e]">{plan.price?.suffix}</span></p><p className="mt-1 text-sm text-[#7a857e]">{plan.durationValue} {plan.durationUnit.toLowerCase()}{plan.durationValue === 1 ? '' : 's'} of access</p></div>
          <ul className="my-7 flex-1 space-y-3">{plan.features.map((feature) => <li key={feature.key} className="flex items-start gap-3 text-sm"><Icon icon={feature.icon} width="20" className="mt-0.5 shrink-0 text-accent" /><span>{featureText(feature)}</span></li>)}</ul>
          <Link to="/login" className="btn-primary w-full" style={{ backgroundColor: plan.appearance?.color, color: plan.appearance?.textColor }}>{plan.public?.ctaText}</Link>
        </div>
      </article>)}</div> : <div className="panel mx-auto max-w-xl p-8 text-center">No plans are currently available.</div>}
    </div>
  </main>;
}
