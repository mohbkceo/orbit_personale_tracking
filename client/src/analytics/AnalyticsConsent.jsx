import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analytics } from './client.js';

export function AnalyticsConsent() {
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem('orbit-analytics-consent'); } catch { return 'denied'; } });
  if (import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT !== 'true' || choice || pathname.startsWith('/admin')) return null;
  const decide = (granted) => { analytics.setConsent(granted); setChoice(granted ? 'granted' : 'denied'); };
  return <aside aria-label="Analytics preference" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
    <p className="text-sm text-muted">Orbit uses optional first-party analytics to understand where visitors find us and which features help them. Allow analytics storage on this browser?</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className="btn-primary" onClick={() => decide(true)}>Allow analytics</button>
      <button type="button" className="btn-secondary" onClick={() => decide(false)}>Decline</button>
    </div>
  </aside>;
}
