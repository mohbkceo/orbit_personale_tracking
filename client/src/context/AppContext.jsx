import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { api } from '../api/client.js';
import { AppContext } from './AppContextBase.js';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { RewardOverlay } from '../animations/RewardOverlay.jsx';
import { rewardConfig } from '../animations/rewardConfig.js';
import { toastMotion, reduced, rewardHold } from '../animations/motionPresets.js';
import { useAuth } from './useAuth.js';
import { applyAppearance, defaults, normalizeAppearance } from '../appearance/themes.js';

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(() => {
    try { return { name: 'My workspace', defaultCurrency: 'DZD', appearance: normalizeAppearance(JSON.parse(localStorage.getItem(`orbit-appearance:${user.id}`))) }; }
    catch { return { name: 'My workspace', defaultCurrency: 'DZD', appearance: defaults }; }
  });
  const [toasts, setToasts] = useState([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [activeReward, setActiveReward] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const reduce = useReducedMotion() || settings.appearance?.motion === 'reduced';

  const toast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID(); setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  }, []);
  const reward = useCallback((event, detail) => {
    const config = rewardConfig[event];
    if (!config) return;
    const id = crypto.randomUUID();
    if (reduce) return;
    setActiveReward({ ...config, effect: settings.appearance?.personality === 'focus' ? 'none' : settings.appearance?.personality === 'expressive' && config.level === 'major' ? 'celebration' : config.effect, id, detail });
    window.setTimeout(() => setActiveReward((current) => current?.id === id ? null : current), rewardHold[config.level]);
  }, [reduce, settings.appearance?.personality]);

  useEffect(() => { api.get('/settings').then((response) => setSettings(response.data)).catch(() => {}); }, [user.id]);
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const appearance = normalizeAppearance(settings.appearance, settings.theme);
    const sync = () => { applyAppearance(appearance, media); setDarkMode(document.documentElement.classList.contains('dark')); };
    sync();
    media.addEventListener('change', sync);
    localStorage.setItem(`orbit-appearance:${user.id}`, JSON.stringify(appearance));
    return () => media.removeEventListener('change', sync);
  }, [settings.appearance, settings.theme, user.id]);
  useEffect(() => () => applyAppearance(defaults, window.matchMedia('(prefers-color-scheme: dark)')), []);

  const value = useMemo(() => ({ settings, setSettings, darkMode, toast, reward, quickAddOpen, setQuickAddOpen }), [settings, darkMode, toast, reward, quickAddOpen]);
  return <AppContext.Provider value={value}>{children}<div className="fixed bottom-24 right-4 z-[80] space-y-2 md:bottom-5"><AnimatePresence initial={false}>{toasts.map((item) => <motion.div key={item.id} layout={!reduce} {...(reduce ? reduced(toastMotion) : toastMotion)} className="flex min-w-72 items-center gap-3 rounded-xl border border-border bg-sidebar px-4 py-3 text-sm text-sidebar-text shadow-lift">{item.type === 'error' ? <XCircle size={18} className="text-danger" /> : <CheckCircle2 size={18} className="text-accent" />}<span className="flex-1">{item.message}</span><button onClick={() => setToasts((items) => items.filter((v) => v.id !== item.id))} aria-label="Dismiss notification"><X size={16} /></button></motion.div>)}</AnimatePresence></div><RewardOverlay reward={activeReward}/></AppContext.Provider>;
}
