import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Activation() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, register, refresh } = useAuth();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('account');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    name: 'My workspace',
    timezone: 'Africa/Algiers',
    defaultCurrency: 'DZD',
    dateFormat: 'DD MMM YYYY',
  });
  const [telegram, setTelegram] = useState(null);
  useEffect(() => {
    api
      .get(`/activation/${key}`)
      .then((response) => setLink(response.data))
      .catch((failure) => setError(failure.message))
      .finally(() => setLoading(false));
  }, [key]);
  useEffect(() => {
    if (user) setStage('telegram');
  }, [user]);
  useEffect(() => {
    if (user)
      api
        .get('/telegram-link')
        .then((response) => setTelegram(response.data))
        .catch(() => {});
  }, [user]);
  const update = (name) => (event) =>
    setForm((value) => ({ ...value, [name]: event.target.value }));
  async function createAccount(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(key, {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        preferences: {
          name: form.name,
          timezone: form.timezone,
          defaultCurrency: form.defaultCurrency,
          dateFormat: form.dateFormat,
        },
      });
      setStage('telegram');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function connectTelegram() {
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/telegram-link');
      setTelegram(response.data);
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    setBusy(true);
    setError('');
    try {
      await api.post(`/activation/${key}/activate`);
      await refresh();
      navigate('/', { replace: true });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading || authLoading) return <Spinner label="Checking Activation Link…" />;
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8 dark:bg-[#0d1310]">
      <div className="panel w-full max-w-xl p-8">
        <span className="text-xs font-bold uppercase tracking-widest text-accent">
          Orbit onboarding
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold">Activate your workspace</h1>
        {link && (
          <div className="mt-5 rounded-xl bg-[#f3f6f2] p-4 dark:bg-white/5">
            <p className="font-bold">{link.plan.name}</p>
            <p className="text-sm text-[#6f7b73]">
              {link.plan.durationValue} {link.plan.durationUnit.toLowerCase()}
              {link.plan.durationValue === 1 ? '' : 's'} of access, starting when you activate.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!link ? (
          <Link to="/login" className="btn-secondary mt-6">
            Go to login
          </Link>
        ) : !user ? (
          link.requiresExistingAccount ? (
            <p className="mt-6 text-sm">
              This renewal link is for an existing account.{' '}
              <Link
                className="text-accent underline"
                to={`/login?next=${encodeURIComponent(`/activate/${key}`)}`}
              >
                Sign in to continue
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="mt-6 text-sm text-[#6f7b73]">
                Already have an account?{' '}
                <Link
                  className="text-accent underline"
                  to={`/login?next=${encodeURIComponent(`/activate/${key}`)}`}
                >
                  Sign in to renew
                </Link>
                .
              </p>
              <form onSubmit={createAccount} className="mt-6 space-y-4">
                <h2 className="font-bold">1. Account and preferences</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="label">Full name</span>
                    <input
                      required
                      className="field"
                      value={form.fullName}
                      onChange={update('fullName')}
                    />
                  </label>
                  <label>
                    <span className="label">Email</span>
                    <input
                      required
                      type="email"
                      className="field"
                      value={form.email}
                      onChange={update('email')}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="label">Password (12+ characters)</span>
                  <input
                    required
                    minLength="12"
                    type="password"
                    className="field"
                    value={form.password}
                    onChange={update('password')}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="label">Workspace name</span>
                    <input className="field" value={form.name} onChange={update('name')} />
                  </label>
                  <label>
                    <span className="label">Timezone</span>
                    <input className="field" value={form.timezone} onChange={update('timezone')} />
                  </label>
                  <label>
                    <span className="label">Currency</span>
                    <input
                      maxLength="3"
                      className="field"
                      value={form.defaultCurrency}
                      onChange={update('defaultCurrency')}
                    />
                  </label>
                  <label>
                    <span className="label">Date format</span>
                    <select
                      className="field"
                      value={form.dateFormat}
                      onChange={update('dateFormat')}
                    >
                      <option>DD MMM YYYY</option>
                      <option>MM/DD/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </label>
                </div>
                <button disabled={busy} className="btn-primary w-full justify-center">
                  {busy ? 'Creating account…' : 'Continue'}
                </button>
              </form>
            </>
          )
        ) : (
          <div className="mt-6 space-y-5">
            <p className="text-sm">
              Signed in as <b>{user.email}</b>. Your existing data and Telegram connection will be
              preserved.
            </p>
            <section className="rounded-xl border border-[#dce1dc] p-4 dark:border-white/10">
              <h2 className="font-bold">2. Telegram (optional)</h2>
              <p className="mt-1 text-sm text-[#6f7b73]">
                Connect the central Orbit bot now, or later from Settings.
              </p>
              {telegram?.connected ? (
                <p className="mt-3 text-sm text-accent">
                  Telegram is connected
                  {telegram.telegramUsername ? ` as @${telegram.telegramUsername}` : ''}.
                </p>
              ) : (
                <button disabled={busy} onClick={connectTelegram} className="btn-secondary mt-3">
                  Connect Telegram
                </button>
              )}
              {telegram?.url && (
                <p className="mt-2 text-xs">
                  A Telegram link opened. Finish there, then continue below.
                </p>
              )}
              <button
                onClick={() =>
                  api.get('/telegram-link').then((response) => setTelegram(response.data))
                }
                className="ml-3 text-xs text-accent underline"
              >
                Refresh status
              </button>
            </section>
            <section>
              <h2 className="font-bold">3. Final activation</h2>
              <p className="mt-1 text-sm text-[#6f7b73]">
                Your access period starts only when you press Activate.
              </p>
              <button
                disabled={busy || stage !== 'telegram'}
                onClick={activate}
                className="btn-primary mt-4 w-full justify-center"
              >
                {busy ? 'Activating…' : 'Activate Orbit access'}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
