import { Link } from 'react-router-dom';
import { LockKeyhole, TriangleAlert } from 'lucide-react';
import { Spinner } from './ui.jsx';
import { useCapabilities } from '../context/CapabilitiesContext.js';
import { useTranslation } from 'react-i18next';

export function LockedFeatureView({ featureKey, decision }) {
  const { t, i18n } = useTranslation();
  const details = decision.presentation || {};
  const unavailable = decision.reason === 'FEATURE_DISABLED';
  const title = i18n.resolvedLanguage === 'ar' ? t(`navigation:${featureKey}`, { defaultValue: details.sectionTitle || featureKey }) : details.sectionTitle || featureKey;
  const preview = details.presentation || 'BLUR';
  return <section aria-label={`${title} access`} className="relative min-h-[480px]">
    <header className="mb-6"><p className="eyebrow">{t('workspace')}</p><h1 className="font-display text-[30px] font-bold">{title}</h1></header>
    {preview !== 'INFORMATION' && <div aria-hidden="true" className={`pointer-events-none grid gap-4 opacity-50 sm:grid-cols-3 ${preview === 'BLUR' ? 'blur-[5px]' : ''}`}>
      {[0, 1, 2].map((item) => <div key={item} className="panel h-32 p-5"><div className="h-3 w-24 rounded bg-surface-alt" /><div className="mt-5 h-6 w-2/3 rounded bg-surface-alt" /><div className="mt-4 h-2 w-full rounded bg-surface-alt" /></div>)}
      <div className="panel h-52 p-5 sm:col-span-3"><div className="h-3 w-36 rounded bg-surface-alt" /><div className="mt-8 h-24 rounded bg-surface-alt" /></div>
    </div>}
    <div className={`relative mx-auto max-w-xl rounded-[var(--orbit-radius)] border border-border bg-surface p-6 text-center shadow-lift sm:p-8 ${preview === 'INFORMATION' ? 'mt-6' : '-mt-28'}`}>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-selected text-primary">{unavailable ? <TriangleAlert size={23} /> : <LockKeyhole size={23} />}</span>
      <h2 className="mt-4 font-display text-xl font-bold">{unavailable ? t('errors:temporarilyUnavailable') : i18n.resolvedLanguage === 'ar' ? t('errors:unlock', { title }) : details.title || t('errors:unlock', { title })}</h2>
      <p className="mt-3 text-sm leading-6 text-muted">{unavailable ? t('errors:temporarilyUnavailableDetail') : i18n.resolvedLanguage === 'ar' ? t('errors:availablePaid', { title }) : details.description || t('errors:availablePaid', { title })}</p>
      {!unavailable && details.explanation && i18n.resolvedLanguage !== 'ar' && <p className="mt-2 text-sm text-muted">{details.explanation}</p>}
      {!unavailable && <><p className="mt-4 text-xs font-semibold text-primary">{details.recommendedPlan?.name ? t('errors:recommended', { plan: details.recommendedPlan.name }) : t('errors:seePlans')}</p>
        <Link className="btn-primary mt-5" to={`/pricing?feature=${encodeURIComponent(featureKey)}${details.recommendedPlan?.slug ? `&plan=${encodeURIComponent(details.recommendedPlan.slug)}` : ''}`}>{i18n.resolvedLanguage === 'ar' ? t('errors:explorePlans') : details.ctaLabel || t('errors:explorePlans')}</Link></>}
    </div>
  </section>;
}

export function FeatureGate({ featureKey, children }) {
  const { t } = useTranslation();
  const { loading, error, refresh, decision } = useCapabilities();
  if (loading) return <Spinner label={t('errors:featureChecking')} />;
  if (error) return <div role="alert" className="panel p-6"><h1 className="font-display text-xl font-bold">{t('errors:accessCheckUnavailable')}</h1><p className="mt-2 text-sm text-muted">{error}</p><button className="btn-primary mt-4" onClick={refresh}>{t('retry')}</button></div>;
  const result = decision(featureKey);
  if (!result) return <div role="alert" className="panel p-6">{t('errors:featureConfigurationUnavailable')}</div>;
  return result.allowed ? children : <LockedFeatureView featureKey={featureKey} decision={result} />;
}
