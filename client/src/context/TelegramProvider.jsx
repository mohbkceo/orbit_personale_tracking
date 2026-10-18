import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { TelegramContext } from './TelegramContext.js';

export function TelegramProvider({ children }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [watching, setWatching] = useState(false);
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await api.get('/telegram-link');
      setStatus(response.data); setError('');
      if (response.data.connected) setLink(null);
      return response.data;
    } catch (failure) { setError(failure.message); return null; }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if ((!open && !watching) || !link || status?.connected) return undefined;
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 4000);
    return () => window.clearInterval(timer);
  }, [open, watching, link, status?.connected, refresh]);
  const connect = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const response = await api.post('/telegram-link');
      setLink(response.data);
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (failure) {
      if (failure.status === 409) await refresh();
      setError(failure.message);
    } finally { setBusy(false); }
  }, [refresh]);
  const disconnect = useCallback(async () => {
    setBusy(true); setError('');
    try { await api.delete('/telegram-link'); setStatus({ connected: false }); setLink(null); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }, []);
  const value = useMemo(() => ({ status, loading, error, open, setOpen, watching, setWatching, link, busy, refresh, connect, disconnect }),
    [status, loading, error, open, watching, link, busy, refresh, connect, disconnect]);
  return <TelegramContext.Provider value={value}>{children}</TelegramContext.Provider>;
}
