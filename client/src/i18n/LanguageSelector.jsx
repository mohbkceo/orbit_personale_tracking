import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { setGuestLanguage } from './index.js';

export function LanguageSelector({ className = '' }) {
  const { i18n, t } = useTranslation();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const language = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  async function select(next) {
    if (busy || next === language) return;
    setError('');
    await i18n.changeLanguage(next);
    if (!auth?.user) { setGuestLanguage(next); return; }
    setBusy(true);
    try { const response = await api.patch('/settings', { language: next }); window.dispatchEvent(new CustomEvent('orbit:settings-synced', { detail: response.data })); }
    catch { await i18n.changeLanguage(language); setError(t('errors:network')); }
    finally { setBusy(false); }
  }
  return <div className={className} aria-label={t('language')}>
    <div role="group" aria-label={t('language')} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold">
      {['en', 'ar'].map((value) => <button key={value} type="button" lang={value} dir={value === 'ar' ? 'rtl' : 'ltr'} disabled={busy} aria-pressed={language === value} onClick={() => select(value)} className={`rounded-md px-2 py-1.5 ${language === value ? 'bg-primary text-primary-text' : 'text-muted hover:bg-hover'}`}>{t(value === 'ar' ? 'arabic' : 'english')}</button>)}
    </div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
