import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function AdminLogin() {
  const { loading, admin, login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <Spinner label="Opening admin panel…" />;
  if (admin) return <Navigate to="/admin" replace />;
  async function submit(event) { event.preventDefault(); setBusy(true); setError(''); try { await login(email, password); navigate('/admin', { replace: true }); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 dark:bg-[#0d1310]"><div className="panel w-full max-w-md p-8"><span className="text-xs font-bold uppercase tracking-widest text-accent">Orbit administration</span><h1 className="mt-3 font-display text-3xl font-bold">Admin sign in</h1><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="label">Email</span><input type="email" autoComplete="email" required className="field" value={email} onChange={(e) => setEmail(e.target.value)}/></label><label className="block"><span className="label">Password</span><input type="password" autoComplete="current-password" required className="field" value={password} onChange={(e) => setPassword(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={busy} className="btn-primary w-full justify-center">{busy ? 'Signing in…' : 'Sign in'}</button></form></div></main>;
}
