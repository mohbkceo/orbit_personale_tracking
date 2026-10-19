import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from './client.js';
import { useTranslation } from 'react-i18next';

export function AnalyticsConsent({ embedded = false }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem('orbit-analytics-consent'); } catch { return 'denied'; } });
  if (import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT !== 'true' || choice || pathname.startsWith('/admin')) return null;
  const decide = (granted) => { analytics.setConsent(granted); setChoice(granted ? 'granted' : 'denied'); };
  return <aside aria-label={t('notifications:analyticsPreference')} className={embedded ? 'mb-4 border-b border-border pb-4' : 'fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl'}>
    <p className="text-sm text-muted">{t('notifications:analyticsDescription')}</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className="btn-primary" onClick={() => decide(true)}>{t('notifications:allowAnalytics')}</button>
      <button type="button" className="btn-secondary" onClick={() => decide(false)}>{t('notifications:decline')}</button>
    </div>
  </aside>;
}
