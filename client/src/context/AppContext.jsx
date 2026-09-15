import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { AppContext } from './AppContextBase.js';

export function AppProvider({ children }) {
  const [settings, setSettings] = useState({ name: 'My workspace', defaultCurrency: 'DZD', theme: localStorage.getItem('orbit-theme') || 'system' });
  const [toasts, setToasts] = useState([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const toast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID(); setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  }, []);

  useEffect(() => { api.get('/settings').then((response) => setSettings(response.data)).catch(() => {}); }, []);
  useEffect(() => {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark); localStorage.setItem('orbit-theme', settings.theme || 'system');
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, setSettings, toast, quickAddOpen, setQuickAddOpen }), [settings, toast, quickAddOpen]);
  return <AppContext.Provider value={value}>{children}<div className="fixed bottom-24 right-4 z-[80] space-y-2 md:bottom-5">{toasts.map((item) => <div key={item.id} className="flex min-w-72 items-center gap-3 rounded-xl border border-black/10 bg-ink px-4 py-3 text-sm text-white shadow-lift dark:bg-[#eef6f0] dark:text-ink">{item.type === 'error' ? <XCircle size={18} className="text-red-400" /> : <CheckCircle2 size={18} className="text-lime" />}<span className="flex-1">{item.message}</span><button onClick={() => setToasts((items) => items.filter((v) => v.id !== item.id))}><X size={16} /></button></div>)}</div></AppContext.Provider>;
}
