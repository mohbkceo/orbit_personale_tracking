import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';
import { AppearancePicker } from '../appearance/AppearancePicker.jsx';
import { defaults, recommendedThemes } from '../appearance/themes.js';

const steps = ['Account', 'About you', 'Workspace', 'Personalize Orbit', 'Telegram', 'Final activation'];

export default function Activation() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, register, refresh } = useAuth();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', gender: '', name: 'My workspace', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Algiers', defaultCurrency: 'DZD', dateFormat: 'DD MMM YYYY', appearance: { ...defaults } });
  const [telegram, setTelegram] = useState(null);
  useEffect(() => { api.get(`/activation/${key}`).then((response) => setLink(response.data)).catch((failure) => setError(failure.message)).finally(() => setLoading(false)); }, [key]);
  useEffect(() => { if (user) setStage(4); }, [user]);
  useEffect(() => { if (user) api.get('/telegram-link').then((response) => setTelegram(response.data)).catch(() => {}); }, [user]);
  const update = (name) => (event) => setForm((value) => ({ ...value, [name]: event.target.value, ...(name === 'gender' ? { appearance: { ...value.appearance, preset: recommendedThemes(event.target.value)[0] } } : {}) }));
  const next = (event) => { event.preventDefault(); setStage((current) => Math.min(current + 1, 3)); };

  async function createAccount(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await register(key, { fullName: form.fullName, email: form.email, password: form.password, gender: form.gender, preferences: { name: form.name, timezone: form.timezone, defaultCurrency: form.defaultCurrency, dateFormat: form.dateFormat, appearance: { mode: form.appearance.mode, preset: form.appearance.preset } } });
      setStage(4);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function connectTelegram() {
    setBusy(true); setError('');
    try { const response = await api.post('/telegram-link'); setTelegram(response.data); window.open(response.data.url, '_blank', 'noopener,noreferrer'); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function activate() {
    setBusy(true); setError('');
    try { await api.post(`/activation/${key}/activate`); await refresh(); navigate('/panel', { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (loading || authLoading) return <Spinner label="Checking Activation Link…" />;
  return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-8"><div className="panel w-full max-w-4xl p-8">
    <span className="text-xs font-bold uppercase tracking-widest text-primary">Orbit onboarding</span>
    <h1 className="mt-3 font-display text-3xl font-bold">Activate your workspace</h1>
    {link && <div className="mt-5 rounded-xl bg-surface-alt p-4"><p className="font-bold">{link.plan.name}</p><p className="text-sm text-muted">{link.plan.durationValue} {link.plan.durationUnit.toLowerCase()}{link.plan.durationValue === 1 ? '' : 's'} of access, starting when you activate.</p></div>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
    {!link ? <Link to="/login" className="btn-secondary mt-6">Go to login</Link> : !user ? link.requiresExistingAccount ? <p className="mt-6 text-sm">This renewal link is for an existing account. <Link className="text-primary underline" to={`/login?next=${encodeURIComponent(`/activate/${key}`)}`}>Sign in to continue</Link>.</p> : <>
      <p className="mt-6 text-sm text-muted">Already have an account? <Link className="text-primary underline" to={`/login?next=${encodeURIComponent(`/activate/${key}`)}`}>Sign in to renew</Link>.</p>
      <ol className="mt-6 flex flex-wrap gap-2 text-xs">{steps.slice(0, 4).map((label, index) => <li key={label} className={`rounded-full px-3 py-1.5 ${index === stage ? 'bg-primary text-primary-text' : 'bg-surface-alt text-muted'}`}>{index + 1}. {label}</li>)}</ol>
      <form onSubmit={stage === 3 ? createAccount : next} className="mt-6 space-y-5">
        <h2 className="font-display text-xl font-bold">{stage + 1}. {steps[stage]}</h2>
        {stage === 0 && <><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Full name</span><input required className="field" value={form.fullName} onChange={update('fullName')} /></label><label><span className="label">Email</span><input required type="email" className="field" value={form.email} onChange={update('email')} /></label></div><label className="block"><span className="label">Password (12+ characters)</span><input required minLength="12" type="password" className="field" value={form.password} onChange={update('password')} /></label></>}
        {stage === 1 && <div><p className="mb-4 text-sm text-muted">This only changes which workspace styles Orbit suggests first. All styles remain available.</p><div className="grid gap-3 sm:grid-cols-2">{[['MALE','Male'],['FEMALE','Female']].map(([id,label]) => <label key={id} className={`cursor-pointer rounded-xl border p-4 ${form.gender === id ? 'border-primary bg-selected' : 'border-border'}`}><input type="radio" name="gender" required value={id} checked={form.gender === id} onChange={update('gender')} className="mr-2 accent-primary" />{label}</label>)}</div></div>}
        {stage === 2 && <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Workspace name</span><input required className="field" value={form.name} onChange={update('name')} /></label><label><span className="label">Timezone</span><input required className="field" value={form.timezone} onChange={update('timezone')} /></label><label><span className="label">Currency</span><input required maxLength="3" minLength="3" className="field uppercase" value={form.defaultCurrency} onChange={update('defaultCurrency')} /></label><label><span className="label">Date format</span><select className="field" value={form.dateFormat} onChange={update('dateFormat')}><option>DD MMM YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label></div>}
        {stage === 3 && <AppearancePicker appearance={form.appearance} gender={form.gender} onChange={(appearance) => setForm((value) => ({ ...value, appearance }))} onboarding />}
        <div className="flex justify-between gap-3">{stage > 0 && <button type="button" className="btn-secondary" onClick={() => setStage((current) => current - 1)}>Back</button>}<button disabled={busy || (stage === 1 && !form.gender)} className="btn-primary ml-auto">{busy ? 'Creating account…' : stage === 3 ? 'Create account and continue' : 'Continue'}</button></div>
      </form>
    </> : <div className="mt-6 space-y-5"><p className="text-sm">Signed in as <b>{user.email}</b>. Your existing data and Telegram connection will be preserved.</p>
      <section className="rounded-xl border border-border p-4"><h2 className="font-bold">5. Telegram (optional)</h2><p className="mt-1 text-sm text-muted">Connect the central Orbit bot now, or later from Settings.</p>{telegram?.connected ? <p className="mt-3 text-sm text-primary">Telegram is connected{telegram.telegramUsername ? ` as @${telegram.telegramUsername}` : ''}.</p> : <button disabled={busy} onClick={connectTelegram} className="btn-secondary mt-3">Connect Telegram</button>}{telegram?.url && <p className="mt-2 text-xs">A Telegram link opened. Finish there, then continue below.</p>}<button onClick={() => api.get('/telegram-link').then((response) => setTelegram(response.data))} className="ml-3 text-xs text-primary underline">Refresh status</button></section>
      <section><h2 className="font-bold">6. Final activation</h2><p className="mt-1 text-sm text-muted">Your access period starts only when you press Activate.</p><button disabled={busy} onClick={activate} className="btn-primary mt-4 w-full justify-center">{busy ? 'Activating…' : 'Activate Orbit access'}</button></section>
    </div>}
  </div></main>;
}
