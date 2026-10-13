import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Onboarding() {
  const { user, access, loading } = useAuth();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [telegramUrl, setTelegramUrl] = useState('');
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login?next=/onboarding" replace />;
  if (!access?.eligible) return <Navigate to="/access" replace />;
  async function connect() {
    setBusy(true); setError('');
    try { const response = await api.post('/telegram-link'); setTelegramUrl(response.data.url); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10"><section className="panel w-full max-w-xl p-8">
    <span className="text-sm font-bold text-primary">Orbit onboarding</span><h1 className="mt-3 font-display text-3xl font-bold">Welcome, {user.fullName}</h1>
    <p className="mt-4 text-muted">Your workspace is ready. Add your first task or connect Telegram for reminders and quick updates.</p>
    {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
    <div className="mt-6 flex flex-wrap gap-3"><Link to="/panel" className="btn-primary">Open my workspace</Link><button disabled={busy} className="btn-secondary" onClick={connect}>{busy ? 'Preparing link…' : 'Connect Telegram (optional)'}</button></div>
    {telegramUrl && <a className="mt-5 block text-primary underline" href={telegramUrl} target="_blank" rel="noopener noreferrer">Continue in Telegram</a>}
    <Link to="/panel/settings" className="mt-6 block text-sm text-primary underline">Personalize your workspace and appearance</Link>
  </section></main>;
}
