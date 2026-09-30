import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import {
  Bell, BookOpenText, CalendarCheck2, CircleDollarSign, Command, ContactRound,
  CreditCard, FolderKanban, Gauge, Goal, Landmark, LayoutList, LogOut, Menu,
  Moon, Plus, ReceiptText, Search, Settings, Sparkles, Sun, WalletCards, X,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { useApp } from '../context/useApp.js';
import { useAuth } from '../context/useAuth.js';
import { cn } from '../utils/format.js';
import { QuickAdd } from './QuickAdd.jsx';
import { SearchPalette } from './SearchPalette.jsx';
import { AnimatedPage } from '../animations/AnimatedPage.jsx';
import { api } from '../api/client.js';

const primaryLinks = [
  ['Dashboard', '/', Gauge], ['Tasks', '/tasks', CalendarCheck2],
  ['Goals', '/planning/goals', Goal], ['Expenses', '/money/expenses', ReceiptText],
  ['Debts', '/money/debts', Landmark], ['Reminders', '/reminders', Bell],
];
const secondaryLinks = [
  ['Accounts', '/money/accounts', WalletCards], ['Transactions', '/money/transactions', LayoutList],
  ['Income', '/money/income', CircleDollarSign], ['Bills', '/planning/bills', CreditCard],
  ['Subscriptions', '/planning/subscriptions', Bell], ['Projects', '/personal/projects', FolderKanban],
  ['Habits', '/personal/habits', Sparkles], ['Wishlist', '/personal/wishlist', BookOpenText],
  ['Contacts', '/personal/contacts', ContactRound], ['Notes', '/personal/notes', BookOpenText],
];

function Brand() {
  return <NavLink to="/" className="flex items-center gap-2.5 text-sidebar-text" aria-label="Orbit home">
    <img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" draggable={false} />
    <span className="font-display text-xl font-bold tracking-tight">Orbit</span>
  </NavLink>;
}

function SidebarLink({ label, path, Icon, close }) {
  return <NavLink end={path === '/'} to={path} onClick={close} className={({ isActive }) => cn(
    'flex min-h-10 items-center gap-3 rounded-[var(--orbit-control-radius)] px-3 text-[13px] font-medium transition-colors',
    isActive ? 'bg-sidebar-selected font-semibold text-primary' : 'text-sidebar-text hover:bg-sidebar-hover',
  )}>
    {({ isActive }) => <><Icon size={18} strokeWidth={1.8} className={isActive ? 'text-primary' : 'text-sidebar-muted'} /><span>{label}</span></>}
  </NavLink>;
}

function Sidebar({ open, close }) {
  const { user, logout } = useAuth();
  const initials = user?.fullName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ME';
  return <aside className={cn(
    'fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col border-r border-border bg-sidebar text-sidebar-text transition-transform duration-200 lg:translate-x-0',
    open ? 'translate-x-0' : '-translate-x-full',
  )}>
    <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border px-5">
      <Brand />
      <button type="button" className="icon-btn lg:hidden" aria-label="Close menu" onClick={close}><X size={19} /></button>
    </div>
    <nav aria-label="Main navigation" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {primaryLinks.map(([label, path, Icon]) => <SidebarLink key={path} label={label} path={path} Icon={Icon} close={close} />)}
      <div className="mx-3 my-4 border-t border-border" />
      <p className="px-3 pb-2 text-xs font-semibold text-sidebar-muted">Workspace</p>
      {secondaryLinks.map(([label, path, Icon]) => <SidebarLink key={path} label={label} path={path} Icon={Icon} close={close} />)}
    </nav>
    <div className="shrink-0 border-t border-border p-3">
      <SidebarLink label="Settings" path="/settings" Icon={Settings} close={close} />
      <div className="mt-2 flex items-center gap-2 border-t border-border px-2 pt-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-text">{initials}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{user?.fullName || 'Orbit user'}</span><span className="block truncate text-[11px] text-sidebar-muted">{user?.email}</span></span>
        <button type="button" className="icon-btn shrink-0" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={16} /></button>
      </div>
    </div>
  </aside>;
}

function Header({ openMenu, openSearch, openQuickAdd, toggleTheme, darkMode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const initials = user?.fullName?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ME';
  useEffect(() => { setProfileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setProfileOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [profileOpen]);
  return <header className="sticky top-0 z-30 border-b border-border bg-surface">
    <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-8">
      <button type="button" className="icon-btn lg:hidden" aria-label="Open menu" onClick={openMenu}><Menu size={20} /></button>
      <button type="button" onClick={openSearch} className="flex h-11 min-w-0 max-w-[480px] flex-1 items-center gap-3 rounded-[var(--orbit-control-radius)] border border-border bg-surface px-3 text-left text-sm text-muted hover:border-primary/40">
        <Search size={18} className="shrink-0" /><span className="truncate">Search anything...</span>
        <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-md border border-border bg-surface-alt px-1.5 py-1 text-[11px] sm:flex"><Command size={11} /> K</span>
      </button>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button type="button" className="icon-btn hidden sm:inline-flex" aria-label="Quick add" title="Quick add (N)" onClick={openQuickAdd}><Plus size={19} /></button>
        <button type="button" className="icon-btn" aria-label="Reminders and notifications" title="Reminders and notifications" onClick={() => navigate('/reminders')}><Bell size={19} /></button>
        <div className="relative">
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-text" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>{initials}</button>
          {profileOpen && <div role="menu" className="absolute right-0 top-11 z-50 w-52 rounded-[var(--orbit-radius)] border border-border bg-surface p-1.5 shadow-lift">
            <p className="truncate border-b border-border px-2 py-2 text-xs font-semibold">{user?.fullName || user?.email}</p>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-hover" onClick={() => { navigate('/settings'); setProfileOpen(false); }}><Settings size={16} /> Settings</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-hover" onClick={() => { toggleTheme(); setProfileOpen(false); }}>{darkMode ? <Sun size={16} /> : <Moon size={16} />} {darkMode ? 'Light mode' : 'Dark mode'}</button>
          </div>}
        </div>
      </div>
    </div>
  </header>;
}

function MobileNav({ openMenu, openQuickAdd }) {
  const location = useLocation();
  const items = [['Home', '/', Gauge], ['Tasks', '/tasks', CalendarCheck2], ['Money', '/money/transactions', WalletCards]];
  const moreActive = location.pathname !== '/' && location.pathname !== '/tasks' && !location.pathname.startsWith('/money/');
  return <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid h-[68px] grid-cols-5 border-t border-border bg-surface px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
    {items.slice(0, 2).map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-primary' : 'text-muted')}><Icon size={20} />{label}</NavLink>)}
    <button type="button" className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-primary" onClick={openQuickAdd} aria-label="Quick add"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-text"><Plus size={22} /></span>Add</button>
    {items.slice(2).map(([label, path, Icon]) => <NavLink key={path} to={path} className={({ isActive }) => cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive || location.pathname.startsWith('/money/') ? 'text-primary' : 'text-muted')}><Icon size={20} />{label}</NavLink>)}
    <button type="button" className={cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium', moreActive ? 'text-primary' : 'text-muted')} onClick={openMenu}><Menu size={20} />More</button>
  </nav>;
}

export function Layout() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const { setQuickAddOpen, darkMode, setSettings } = useApp();
  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => { setMenu(false); }, [location.pathname]);
  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearch(true); }
      const activeTag = document.activeElement?.tagName;
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'n' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) { event.preventDefault(); setQuickAddOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setQuickAddOpen]);

  const toggleTheme = async () => {
    const mode = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    try { const response = await api.patch('/settings', { appearance: { mode } }); setSettings(response.data); }
    catch { /* The persisted setting remains authoritative if the shortcut cannot be saved. */ }
  };

  return <div className="min-h-screen bg-canvas">
    <Sidebar open={menu} close={() => setMenu(false)} />
    {menu && <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 bg-text/40 lg:hidden" onClick={() => setMenu(false)} />}
    <div className="min-w-0 lg:pl-[236px]">
      <Header openMenu={() => setMenu(true)} openSearch={() => setSearch(true)} openQuickAdd={() => setQuickAddOpen(true)} toggleTheme={toggleTheme} darkMode={darkMode} />
      <main className="mx-auto max-w-[1480px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
        <AnimatePresence mode="wait" initial={false}><AnimatedPage key={location.pathname}>{outlet}</AnimatedPage></AnimatePresence>
      </main>
    </div>
    <MobileNav openMenu={() => setMenu(true)} openQuickAdd={() => setQuickAddOpen(true)} />
    <QuickAdd />
    <SearchPalette open={search} onClose={() => setSearch(false)} />
  </div>;
}
