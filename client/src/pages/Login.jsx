import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { loginDestination } from '../utils/navigation.js';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

export default function Login() {
  const { t: _t } = useTranslation();
  const { t } = useTranslation();
  const { loading, user, access, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <Spinner label={_t('auth:ui.openingOrbit')} />;
  if (user) return <Navigate to={loginDestination(params.get('next'), access?.eligible)} replace />;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login(email, password); navigate(loginDestination(params.get('next'), result.access?.eligible), { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4"><div className="panel w-full max-w-md p-8"><div className="mb-8 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><img src="/logo-orbit.png" alt="" className="h-10 w-10 object-contain" /><span className="font-display text-2xl font-bold">Orbit</span></div><LanguageSelector /></div><h1 className="font-display text-3xl font-bold">{t('auth:welcomeBack')}</h1><p className="mt-2 text-sm text-muted">{t('auth:signInIntro')}</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="label">{t('auth:email')}</span><input autoComplete="email" type="email" required className="field" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label className="block"><span className="label">{t('auth:password')}</span><input autoComplete="current-password" type="password" required className="field" value={password} onChange={(e) => setPassword(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<button disabled={busy} className="btn-primary w-full justify-center">{t(busy ? 'auth:signingIn' : 'auth:signIn')}</button></form><p className="mt-6 text-center text-xs text-muted">{t('auth:newToOrbit')} <Link to={`/register?next=${encodeURIComponent(params.get('next') || '/panel')}`} className="text-primary underline">{t('auth:createAnAccount')}</Link></p><p className="mt-3 text-center text-xs"><Link to="/pricing" className="text-primary underline">{t('auth:viewPlans')}</Link><span className="mx-2 text-muted">·</span><Link to="/admin/login" className="text-primary underline">{t('auth:adminSignIn')}</Link></p></div></main>;
}
