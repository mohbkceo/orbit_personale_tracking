import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { CapabilitiesContext } from './CapabilitiesContext.js';

export function CapabilitiesProvider({ children }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const refresh = useCallback(async () => {
    try {
      const response = await api.get('/me/capabilities');
      setState({ loading: false, data: response.data, error: null });
      return response.data;
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error: error.message }));
      return null;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = () => { void refresh(); };
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('orbit:capabilities-changed', onChange);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30_000);
    return () => { window.removeEventListener('orbit:capabilities-changed', onChange); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer); };
  }, [refresh]);
  const value = useMemo(() => ({ ...state, refresh, decision: (key) => state.error ? null : state.data?.capabilities?.[key] || null,
    allowed: (key) => !state.error && state.data?.capabilities?.[key]?.allowed === true }), [state, refresh]);
  return <CapabilitiesContext.Provider value={value}>{children}</CapabilitiesContext.Provider>;
}
