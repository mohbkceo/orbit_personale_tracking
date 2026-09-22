import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Login() {
  const { loading, user, access, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <Spinner label="Opening Orbit…" />;
  if (user) return <Navigate to={params.get('next') || (access?.eligible ? '/' : '/access')} replace />;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await login(email, password); navigate(params.get('next') || (result.access?.eligible ? '/' : '/access'), { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 dark:bg-[#0d1310]"><div className="panel w-full max-w-md p-8"><div className="mb-8 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime font-black text-ink">O</span><span className="font-display text-2xl font-bold">Orbit</span></div><h1 className="font-display text-3xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-[#7a857e]">Sign in to your personal workspace.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="label">Email</span><input autoComplete="email" type="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label className="block"><span className="label">Password</span><input autoComplete="current-password" type="password" required className="field" value={password} onChange={(e) => setPassword(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="btn-primary w-full justify-center">{busy ? 'Signing in…' : 'Sign in'}</button></form><p className="mt-6 text-center text-xs text-[#7a857e]">New to Orbit? An Activation Link is required to create an account.</p><p className="mt-3 text-center text-xs"><Link to="/pricing" className="text-accent underline">View plans</Link><span className="mx-2 text-[#7a857e]">·</span><Link to="/admin/login" className="text-accent underline">Admin sign in</Link></p></div></main>;
}
