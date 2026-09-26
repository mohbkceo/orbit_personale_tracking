import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { AppContext } from './AppContextBase.js';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RewardOverlay } from '../animations/RewardOverlay.jsx';
import { rewardConfig } from '../animations/rewardConfig.js';
import { toastMotion, reduced, rewardHold } from '../animations/motionPresets.js';

export function AppProvider({ children }) {
  const [settings, setSettings] = useState({ name: 'My workspace', defaultCurrency: 'DZD', theme: localStorage.getItem('orbit-theme') || 'system' });
  const [toasts, setToasts] = useState([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [activeReward, setActiveReward] = useState(null);
  const reduce = useReducedMotion();

  const toast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID(); setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  }, []);
  const reward = useCallback((event, detail) => {
    const config = rewardConfig[event];
    if (!config) return;
    const id = crypto.randomUUID();
    setActiveReward({ ...config, id, detail });
    window.setTimeout(() => setActiveReward((current) => current?.id === id ? null : current), rewardHold[config.level]);
  }, []);

  useEffect(() => { api.get('/settings').then((response) => setSettings(response.data)).catch(() => {}); }, []);
  useEffect(() => {
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark); localStorage.setItem('orbit-theme', settings.theme || 'system');
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, setSettings, toast, reward, quickAddOpen, setQuickAddOpen }), [settings, toast, reward, quickAddOpen]);
  return <AppContext.Provider value={value}>{children}<div className="fixed bottom-24 right-4 z-[80] space-y-2 md:bottom-5"><AnimatePresence initial={false}>{toasts.map((item) => <motion.div key={item.id} layout={!reduce} {...(reduce ? reduced(toastMotion) : toastMotion)} className="flex min-w-72 items-center gap-3 rounded-xl border border-black/10 bg-ink px-4 py-3 text-sm text-white shadow-lift dark:bg-[#eef6f0] dark:text-ink">{item.type === 'error' ? <XCircle size={18} className="text-red-400" /> : <CheckCircle2 size={18} className="text-lime" />}<span className="flex-1">{item.message}</span><button onClick={() => setToasts((items) => items.filter((v) => v.id !== item.id))} aria-label="Dismiss notification"><X size={16} /></button></motion.div>)}</AnimatePresence></div><RewardOverlay reward={activeReward}/></AppContext.Provider>;
}
