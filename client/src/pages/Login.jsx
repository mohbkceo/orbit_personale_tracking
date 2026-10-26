import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { loginDestination } from '../utils/navigation.js';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EB4300]/70 focus-visible:ring-offset-2';

export default function Login() {
  const { t, i18n } = useTranslation();
  const { loading, user, access, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Fallback labels work in both supported languages without requiring new keys.
  const arabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');
  const passwordToggleLabel = showPassword
    ? t('auth:hidePassword', { defaultValue: arabic ? 'إخفاء كلمة المرور' : 'Hide password' })
    : t('auth:showPassword', { defaultValue: arabic ? 'إظهار كلمة المرور' : 'Show password' });

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      const result = await login(email.trim(), password);
      navigate(loginDestination(params.get('next'), result.access?.eligible), { replace: true });
    } catch (failure) {
      setError(
        failure?.message ||
          t('auth:signInError', {
            defaultValue: arabic
              ? 'تعذّر تسجيل الدخول. حاول مرة أخرى.'
              : 'Unable to sign in. Please try again.',
          }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label={t('auth:ui.openingOrbit')} />;
  if (user) return <Navigate to={loginDestination(params.get('next'), access?.eligible)} replace />;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#fff8f4] px-4 py-8 text-slate-800 sm:px-6 sm:py-12">
      {/* Subtle background gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] top-0 h-[500px] w-[500px] rounded-full bg-[#EB4300]/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[10%] bottom-0 h-[500px] w-[500px] rounded-full bg-[#FFB18F]/25 blur-[120px]"
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/40 p-6 shadow-xs backdrop-blur-[40px] saturate-150 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
        />

        <header className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Orbit
            </span>
          </div>
          <LanguageSelector />
        </header>

        <div className="mb-7 pt-4">
          <h1 className="font-display text-4xl font-extrabold tracking-wider text-slate-900 sm:text-4xl">
            {t('auth:welcomeBack')} 👋
          </h1>
        </div>

        <form onSubmit={submit} aria-busy={busy} className="space-y-5">
          <div>
            <label
              htmlFor="login-email"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              {t('auth:email')}
            </label>
            <div className="relative">
              <Mail
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                dir="ltr"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error) setError('');
                }}
                className="w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-4 text-left text-base font-medium text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:bg-white/75 focus:border-[#EB4300]/80 focus:bg-white/90 focus:ring-2 focus:ring-[#EB4300]/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              {t('auth:password')}
            </label>
            <div className="relative">
              <Lock
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="login-password"
                name="password"
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                required
                dir="ltr"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError('');
                }}
                className="w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-12 text-left text-base font-medium text-slate-800 outline-none transition-colors hover:bg-white/75 focus:border-[#EB4300]/80 focus:bg-white/90 focus:ring-2 focus:ring-[#EB4300]/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={passwordToggleLabel}
                aria-pressed={showPassword}
                title={passwordToggleLabel}
                className={`absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100/70 hover:text-slate-800 ${focusRing}`}
              >
                {showPassword ? (
                  <EyeOff size={19} aria-hidden="true" />
                ) : (
                  <Eye size={19} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-2xl border border-rose-200/80 bg-rose-50/80 p-3.5 text-sm font-medium leading-5 text-rose-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#EB4300] px-6 py-3.5 text-base font-semibold text-white shadow-xs transition-colors hover:bg-[#D63D00] active:bg-[#B93300] disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
          >
            <span>{t(busy ? 'auth:signingIn' : 'auth:signIn')}</span>
            {!busy && <ArrowRight size={17} className="rtl-flip" aria-hidden="true" />}
          </button>
        </form>

        <footer className="mt-7 space-y-3 border-t border-white/60 pt-6 text-center">
          <p className="text-sm font-medium leading-6 text-slate-600">
            {t('auth:newToOrbit')}{' '}
            <Link
              to={`/register?next=${encodeURIComponent(params.get('next') || '/panel')}`}
              className={`font-semibold text-[#EB4300] underline underline-offset-2 hover:text-[#C73900] ${focusRing}`}
            >
              {t('auth:createAnAccount')}
            </Link>
          </p>
          <p className="text-sm font-medium text-slate-500">
            <Link
              to="/pricing"
              className={`font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-800 ${focusRing}`}
            >
              {t('auth:viewPlans')}
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
