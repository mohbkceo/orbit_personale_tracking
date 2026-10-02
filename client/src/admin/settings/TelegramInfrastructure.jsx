import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';

export function TelegramInfrastructure() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() { try { setStatus((await api.get('/admin/settings')).data); setError(''); } catch (failure) { setError(failure.message); } }
  useEffect(() => { void refresh(); }, []);
  async function webhook(action) { setBusy(true); try { await api.post(`/admin/settings/telegram/webhook/${action}`); await refresh(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <section className="panel mt-5 space-y-4 p-5 text-sm"><div><h3 className="font-display text-base font-bold">Telegram infrastructure</h3><p className="mt-1 text-xs text-muted">Connection status and webhook controls. Secrets are never shown here.</p></div>
    {error && <p role="alert" className="break-words text-danger">{error}</p>}
    {status && <div className="grid gap-3 sm:grid-cols-2"><p>Bot token: <b>{status.telegramConfigured ? 'Configured' : 'Not configured'}</b></p><p className="admin-break">Bot username: <b>{status.botUsername || 'Not configured'}</b></p><p>Webhook secret: <b>{status.webhookConfigured ? 'Configured' : 'Not configured'}</b></p></div>}
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => webhook('register')}>Register webhook</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => webhook('remove')}>Remove webhook</button></div>
  </section>;
}
