import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { loginDestination } from '../utils/navigation.js';
import { analytics } from '../analytics/client.js';
import { EVENTS } from '../analytics/events.js';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EB4300]/70 focus-visible:ring-offset-2';
const inputClass =
  'w-full rounded-2xl border border-white/70 bg-white/60 py-3.5 pl-11 pr-4 text-base font-medium text-slate-800 outline-none transition-colors hover:bg-white/75 focus:border-[#EB4300]/80 focus:bg-white/90 focus:ring-2 focus:ring-[#EB4300]/20';

export default function Register() {
  const { t, i18n } = useTranslation();
  const { loading, user, access, registerDirect } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const registering = useRef(false);
  const next = loginDestination(params.get('next'), access?.eligible);
  const arabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');
  const toggleLabel = showPassword
    ? t('auth:hidePassword', { defaultValue: arabic ? 'إخفاء كلمة المرور' : 'Hide password' })
    : t('auth:showPassword', { defaultValue: arabic ? 'إظهار كلمة المرور' : 'Show password' });

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (registering.current) return;
    registering.current = true;
    setBusy(true);
    setError('');
    analytics.track(EVENTS.SIGNUP_STARTED);
    try {
      await registerDirect({ ...form, fullName: form.fullName.trim(), email: form.email.trim() });
      try {
        sessionStorage.removeItem('orbit:registration-next');
        if (params.get('next') && next !== '/panel' && next !== '/access') {
          sessionStorage.setItem('orbit:registration-next', next);
        }
      } catch {
        /* Browser storage is optional. */
      }
      navigate('/onboarding', { replace: true });
    } catch (failure) {
      registering.current = false;
      setError(
        failure?.message ||
          t('auth:registerError', {
            defaultValue: arabic
              ? 'تعذر إنشاء الحساب. حاول مجددًا.'
              : 'Could not create your account. Please try again.',
          }),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (user) return <Navigate to={registering.current ? '/onboarding' : next} replace />;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#f4f7fb] px-4 py-8 text-slate-800 sm:px-6 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] top-0 h-[500px] w-[500px] rounded-full bg-orange-300/30 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[10%] bottom-0 h-[500px] w-[500px] rounded-full bg-orange-200/20 blur-[120px]"
      />

      <section className="relative z-10 w-full max-w-md overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/40 p-6 shadow-xs backdrop-blur-[40px] saturate-150 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"
        />

        <header className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className={`flex items-center gap-2.5 rounded-xl ${focusRing}`}>
            <img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />
            <span className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Orbit
            </span>
          </Link>
          <LanguageSelector />
        </header>

        <div className="mb-7">
          <h1 className="font-display text-4xl font-extrabold tracking-wider text-slate-900 sm:text-4xl">
            {t('auth:createAccount')}
          </h1>
        </div>

        <form onSubmit={submit} aria-busy={busy} className="space-y-5">
          <div>
            <label
              htmlFor="register-name"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              {t('auth:fullName')}
            </label>
            <div className="relative">
              <UserRound
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="register-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={form.fullName}
                onChange={(e) => updateField('fullName', e.target.value)}
                className={`${inputClass} ps-11 pe-4`}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="register-email"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              {t('auth:email')}
            </label>
            <div className="relative">
              <Mail
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="register-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                dir="ltr"
                required
                maxLength={254}
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={`${inputClass} text-left`}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="register-password"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              {t('auth:password')}
            </label>
            <div className="relative">
              <Lock
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                dir="ltr"
                required
                minLength={12}
                maxLength={200}
                aria-describedby="register-password-hint"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                className={`${inputClass} pr-12 text-left`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={toggleLabel}
                aria-pressed={showPassword}
                title={toggleLabel}
                className={`absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100/70 hover:text-slate-800 ${focusRing}`}
              >
                {showPassword ? (
                  <EyeOff size={19} aria-hidden="true" />
                ) : (
                  <Eye size={19} aria-hidden="true" />
                )}
              </button>
            </div>
            <p id="register-password-hint" className="mt-2 text-xs leading-5 text-slate-500">
              {t('auth:passwordHint')}
            </p>
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
            <span>{t(busy ? 'auth:creating' : 'auth:createAndContinue')}</span>
            {!busy && <ArrowRight size={17} className="rtl-flip" aria-hidden="true" />}
          </button>
        </form>

        <footer className="mt-7 border-t border-white/60 pt-6 text-center">
          <p className="text-sm font-medium leading-6 text-slate-600">
            {t('auth:alreadyAccount')}{' '}
            <Link
              to={`/login?next=${encodeURIComponent(next)}`}
              className={`font-semibold text-[#EB4300] underline underline-offset-2 hover:text-[#D63D00] ${focusRing}`}
            >
              {t('auth:signIn')}
            </Link>
          </p>
        </footer>
      </section>
    </main>
  );
}
