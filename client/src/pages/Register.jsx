import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { loginDestination } from '../utils/navigation.js';
import { analytics } from '../analytics/client.js';
import { EVENTS } from '../analytics/events.js';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

export default function Register() {
  const { t } = useTranslation();
  const { loading, user, access, registerDirect } = useAuth();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const registering = useRef(false);
  const next = loginDestination(params.get('next'), access?.eligible);
  if (loading) return <Spinner />;
  if (user) return <Navigate to={registering.current ? '/onboarding' : next} replace />;
  async function submit(event) {
    event.preventDefault(); if (registering.current) return; registering.current = true; setBusy(true); setError('');
    analytics.track(EVENTS.SIGNUP_STARTED);
    try {
      await registerDirect(form);
      try {
        sessionStorage.removeItem('orbit:registration-next');
        if (params.get('next') && next !== '/panel' && next !== '/access') sessionStorage.setItem('orbit:registration-next', next);
      } catch { /* Registration succeeded even if browser storage is unavailable. */ }
      navigate('/onboarding', { replace: true });
    }
    catch (failure) { registering.current = false; setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10"><section className="panel w-full max-w-md p-6 sm:p-8">
    <div className="flex items-center justify-between gap-2"><Link to="/" className="font-display text-2xl font-bold">Orbit</Link><LanguageSelector /></div><h1 className="mt-6 font-display text-3xl font-bold">{t('auth:createAccount')}</h1>
    <p className="mt-2 text-sm text-muted">{t('auth:registerIntro')}</p>
    <form onSubmit={submit} className="mt-6 space-y-4">{[['fullName', 'text', 'name'], ['email', 'email', 'email'], ['password', 'password', 'new-password']].map(([key, type, complete]) => <label key={key} className="block"><span className="label">{t(`auth:${key}`)}</span><input className="field" required type={type} autoComplete={complete} minLength={key === 'password' ? 12 : key === 'fullName' ? 2 : undefined} maxLength={key === 'fullName' ? 120 : key === 'password' ? 200 : 254} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <p className="text-xs text-muted">{t('auth:passwordHint')}</p>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<button disabled={busy} className="btn-primary w-full justify-center">{t(busy ? 'auth:creating' : 'auth:createAndContinue')}</button>
    </form><p className="mt-5 text-sm">{t('auth:alreadyAccount')} <Link className="text-primary underline" to={`/login?next=${encodeURIComponent(next)}`}>{t('auth:signIn')}</Link></p>
  </section></main>;
}
