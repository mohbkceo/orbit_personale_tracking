import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { meta } from './meta.js';
import { AnalyticsConsent } from './AnalyticsConsent.jsx';

export function AdvertisingConsent() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => !meta.choice());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (pathname.startsWith('/admin')) return null;
  async function decide(granted) {
    setBusy(true); setError('');
    try { await meta.setConsent(granted); setOpen(false); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!open) return <button className="fixed bottom-2 right-2 z-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow" onClick={() => setOpen(true)}>Privacy choices</button>;
  return <aside aria-label="Advertising privacy choices" className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
    <AnalyticsConsent embedded />
    <p className="font-bold">Your advertising privacy</p>
    <p className="mt-2 text-sm text-muted">With your permission, Orbit shares visits and conversions with Meta, including matching identifiers, to measure advertising. This is optional and separate from Orbit analytics. You can withdraw permission here at any time.</p>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="btn-secondary" onClick={() => decide(false)}>Decline / withdraw</button><button disabled={busy} className="btn-primary" onClick={() => decide(true)}>Allow advertising</button></div>
  </aside>;
}
