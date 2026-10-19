import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { AuthContext, AdminAuthContext } from './AuthContextBase.js';
import { analytics } from '../analytics/client.js';
import { meta } from '../analytics/meta.js';
import i18n, { guestLanguage, normalizeLanguage } from '../i18n/index.js';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, access: null, error: null });
  const refresh = useCallback(async () => {
    try { const response = await api.get('/auth/me'); const settings = await api.get('/settings'); await i18n.changeLanguage(normalizeLanguage(settings.data.language)); window.dispatchEvent(new CustomEvent('orbit:settings-synced', { detail: settings.data })); setState({ loading: false, user: response.data.user, access: response.data.access, error: null }); return response.data; }
    catch (failure) { await i18n.changeLanguage(guestLanguage()); setState({ loading: false, user: null, access: null, error: failure.status === 401 ? null : failure.message }); return null; }
  }, []);
  useEffect(() => { refresh(); const onChange = () => refresh(); const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); }; window.addEventListener('orbit:auth-changed', onChange); window.addEventListener('orbit:access-changed', onChange); document.addEventListener('visibilitychange', onVisible); return () => { window.removeEventListener('orbit:auth-changed', onChange); window.removeEventListener('orbit:access-changed', onChange); document.removeEventListener('visibilitychange', onVisible); }; }, [refresh]);
  const login = async (email, password) => { const response = await api.post('/auth/login', { email, password }); const settings = await api.get('/settings'); await i18n.changeLanguage(normalizeLanguage(settings.data.language)); window.dispatchEvent(new CustomEvent('orbit:settings-synced', { detail: settings.data })); await meta.sync(); setState({ loading: false, user: response.data.user, access: response.data.access, error: null }); void analytics.identify(); return response.data; };
  const register = async (key, input) => { await analytics.session(); const response = await api.post(`/activation/${key}/register`, { ...input, preferences: { ...input.preferences, language: guestLanguage() } }); await refresh(); try { meta.event(response.data.conversion, '/register'); } catch { /* Registration already succeeded; advertising is optional. */ } void analytics.identify(); return response.data; };
  const registerDirect = async (input) => { await analytics.session(); const response = await api.post('/auth/register', { ...input, language: guestLanguage() }); setState({ loading: false, user: response.data.user, access: response.data.access, error: null }); try { meta.event(response.data.conversion, '/register'); } catch { /* Registration already succeeded; advertising is optional. */ } void analytics.identify(); return response.data; };
  const logout = async () => { await api.post('/auth/logout'); await meta.sync(); await i18n.changeLanguage(guestLanguage()); setState({ loading: false, user: null, access: null, error: null }); void analytics.identify(); };
  const value = { ...state, refresh, login, register, registerDirect, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AdminAuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, admin: null });
  const refresh = useCallback(async () => {
    try { const response = await api.get('/admin/auth/me'); setState({ loading: false, admin: response.data.admin }); return response.data.admin; }
    catch { setState({ loading: false, admin: null }); return null; }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = async (email, password) => { const response = await api.post('/admin/auth/login', { email, password }); setState({ loading: false, admin: response.data.admin }); return response.data.admin; };
  const logout = async () => { await api.post('/admin/auth/logout'); setState({ loading: false, admin: null }); };
  const value = { ...state, refresh, login, logout };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
