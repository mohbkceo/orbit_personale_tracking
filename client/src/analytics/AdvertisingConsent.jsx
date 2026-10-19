import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { meta } from './meta.js';
import { AnalyticsConsent } from './AnalyticsConsent.jsx';
import { useTranslation } from 'react-i18next';

export function AdvertisingConsent() {
  const { t } = useTranslation();
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
  if (!open) return <button className="fixed bottom-2 end-2 z-40 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow" onClick={() => setOpen(true)}>{t('notifications:privacyChoices')}</button>;
  return <aside aria-label={t('notifications:advertisingPrivacy')} className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 shadow-2xl">
    <AnalyticsConsent embedded />
    <p className="font-bold">{t('notifications:advertisingPrivacy')}</p>
    <p className="mt-2 text-sm text-muted">{t('notifications:advertisingDescription')}</p>
    {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-3"><button disabled={busy} className="btn-secondary" onClick={() => decide(false)}>{t('notifications:declineWithdraw')}</button><button disabled={busy} className="btn-primary" onClick={() => decide(true)}>{t('notifications:allowAdvertising')}</button></div>
  </aside>;
}
