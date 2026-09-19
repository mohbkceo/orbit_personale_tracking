import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { AuthContext, AdminAuthContext } from './AuthContextBase.js';

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, access: null });
  const refresh = useCallback(async () => {
    try { const response = await api.get('/auth/me'); setState({ loading: false, user: response.data.user, access: response.data.access }); return response.data; }
    catch { setState({ loading: false, user: null, access: null }); return null; }
  }, []);
  useEffect(() => { refresh(); const onChange = () => refresh(); window.addEventListener('orbit:auth-changed', onChange); window.addEventListener('orbit:access-changed', onChange); return () => { window.removeEventListener('orbit:auth-changed', onChange); window.removeEventListener('orbit:access-changed', onChange); }; }, [refresh]);
  const login = async (email, password) => { const response = await api.post('/auth/login', { email, password }); setState({ loading: false, user: response.data.user, access: response.data.access }); return response.data; };
  const register = async (key, input) => { const response = await api.post(`/activation/${key}/register`, input); await refresh(); return response.data; };
  const logout = async () => { await api.post('/auth/logout'); setState({ loading: false, user: null, access: null }); };
  const value = { ...state, refresh, login, register, logout };
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
