import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { loginDestination } from '../utils/navigation.js';
import { analytics } from '../analytics/client.js';
import { EVENTS } from '../analytics/events.js';

export default function Register() {
  const { loading, user, access, registerDirect } = useAuth();
  const [params] = useSearchParams(); const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const next = loginDestination(params.get('next'), access?.eligible);
  if (loading) return <Spinner />;
  if (user) return <Navigate to={next === '/access' ? '/pricing' : next} replace />;
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    analytics.track(EVENTS.SIGNUP_STARTED);
    try { await registerDirect(form); navigate(next === '/access' ? '/pricing' : next, { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10"><section className="panel w-full max-w-md p-6 sm:p-8">
    <Link to="/" className="font-display text-2xl font-bold">Orbit</Link><h1 className="mt-6 font-display text-3xl font-bold">Create your account</h1>
    <p className="mt-2 text-sm text-muted">One account for your tasks, money, goals and reminders. Choose and activate a plan when you’re ready.</p>
    <form onSubmit={submit} className="mt-6 space-y-4">{[['fullName', 'Full name', 'text', 'name'], ['email', 'Email', 'email', 'email'], ['password', 'Password', 'password', 'new-password']].map(([key, label, type, complete]) => <label key={key} className="block"><span className="label">{label}</span><input className="field" required type={type} autoComplete={complete} minLength={key === 'password' ? 12 : key === 'fullName' ? 2 : undefined} maxLength={key === 'fullName' ? 120 : key === 'password' ? 200 : 254} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <p className="text-xs text-muted">Use at least 12 characters for your password.</p>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<button disabled={busy} className="btn-primary w-full justify-center">{busy ? 'Creating your account…' : 'Create account & continue'}</button>
    </form><p className="mt-5 text-sm">Already have an account? <Link className="text-primary underline" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></p>
  </section></main>;
}
