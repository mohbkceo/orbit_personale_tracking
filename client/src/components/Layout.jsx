import { useEffect, useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import {
  Bell,
  BookOpenText,
  CalendarCheck2,
  CircleDollarSign,
  Command,
  ContactRound,
  CreditCard,
  FolderKanban,
  Gauge,
  Goal,
  Landmark,
  LayoutList,
  LogOut,
  Menu,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  Sun,
  WalletCards,
  X,
} from 'lucide-react';

import { AnimatePresence } from 'motion/react';

import { useApp } from '../context/useApp.js';
import { useAuth } from '../context/useAuth.js';
import { cn } from '../utils/format.js';
import { QuickAdd } from './QuickAdd.jsx';
import { SearchPalette } from './SearchPalette.jsx';
import { AnimatedPage } from '../animations/AnimatedPage.jsx';
import { api } from '../api/client.js';

const sections = [
  {
    label: null,
    items: [
      ['Dashboard', '/', Gauge],
      ['Tasks', '/tasks', CalendarCheck2],
      ['Reminders', '/reminders', Bell],
    ],
  },
  {
    label: 'Money',
    items: [
      ['Accounts', '/money/accounts', WalletCards],
      ['Transactions', '/money/transactions', LayoutList],
      ['Expenses', '/money/expenses', ReceiptText],
      ['Income', '/money/income', CircleDollarSign],
      ['Debts', '/money/debts', Landmark],
      ['Bills', '/planning/bills', CreditCard],
      ['Subscriptions', '/planning/subscriptions', Bell],
    ],
  },
  {
    label: 'Planning',
    items: [
      ['Goals & savings', '/planning/goals', Goal],
      ['Projects', '/personal/projects', FolderKanban],
      ['Habits', '/personal/habits', Sparkles],
      ['Wishlist', '/personal/wishlist', BookOpenText],
    ],
  },
  {
    label: 'Personal',
    items: [
      ['Contacts', '/personal/contacts', ContactRound],
      ['Notes', '/personal/notes', BookOpenText],
      ['Settings', '/settings', Settings],
    ],
  },
];

const mobileItems = [
  ['Home', '/', Gauge],
  ['Tasks', '/tasks', CalendarCheck2],
  ['', '#add', Plus],
  ['Money', '/money/transactions', WalletCards],
  ['More', '/settings', Menu],
];

function Logo() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-sidebar-hover bg-sidebar shadow-sm">
        {/* Soft highlight */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/10" />

        <svg
          viewBox="0 0 32 32"
          className="relative h-[25px] w-[25px]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            {/* ToOutdo-style orange gradient */}
            <linearGradient
              id="orbit-logo-gradient"
              x1="5"
              y1="27"
              x2="26"
              y2="4"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#FF4D00" />
              <stop offset="48%" stopColor="#FF7900" />
              <stop offset="100%" stopColor="#FFB000" />
            </linearGradient>

            {/* Removes the eyes + smile from the orange shape */}
            <mask id="orbit-logo-face-mask">
              <rect width="32" height="32" fill="black" />

              {/* Main icon */}
              <g stroke="white" strokeWidth="5.2" strokeLinecap="round">
                <path d="M16 16V4.6" />
                <path d="M16 16L24.2 7.8" />
                <path d="M16 16H27.4" />
                <path d="M16 16L24.2 24.2" />
                <path d="M16 16V27.4" />
                <path d="M16 16L7.8 24.2" />
                <path d="M16 16H4.6" />
                <path d="M16 16L7.8 7.8" />
              </g>

              {/* Face cutouts */}
              <rect x="12" y="13" width="1.8" height="3.3" rx="0.9" fill="black" />

              <rect x="18.2" y="13" width="1.8" height="3.3" rx="0.9" fill="black" />

              <path
                d="M13.4 18.2C14.1 19.15 14.95 19.6 16 19.6C17.05 19.6 17.9 19.15 18.6 18.2"
                fill="none"
                stroke="black"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </mask>
          </defs>

          <g mask="url(#orbit-logo-face-mask)">
            <rect width="32" height="32" fill="url(#orbit-logo-gradient)" />
          </g>
        </svg>
      </div>

      <div className="min-w-0">
        <div className="font-display text-[19px] font-black leading-none tracking-[-0.04em]">
          Orbit
        </div>

        <div className="mt-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-sidebar-muted">
          by toOutdo
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ label, path, Icon, close }) {
  return (
    <NavLink
      end={path === '/'}
      to={path}
      onClick={close}
      className={({ isActive }) =>
        cn(
          'group relative mb-1 flex min-h-[42px] items-center gap-3 rounded-xl border px-3',
          'text-[13px] font-semibold transition-all duration-200',
          isActive
            ? 'border-sidebar-hover bg-sidebar-selected text-sidebar-text shadow-sm'
            : 'border-transparent text-sidebar-muted hover:border-sidebar-hover hover:bg-sidebar-hover hover:text-sidebar-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <div
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors',
              isActive
                ? 'bg-accent/10 text-accent'
                : 'text-sidebar-muted group-hover:text-sidebar-text',
            )}
          >
            <Icon size={16} strokeWidth={2} />
          </div>

          <span className="min-w-0 flex-1 truncate">{label}</span>

          {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ open, close }) {
  const { user, logout } = useAuth();

  const initials =
    user?.fullName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'ME';

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col',
        'border-r border-sidebar-hover bg-sidebar text-sidebar-text',
        'transition-transform duration-300 ease-out',
        'lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      {/* Brand */}
      <div className="flex h-20 shrink-0 items-center justify-between px-5">
        <Logo />

        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className="grid h-9 w-9 place-items-center rounded-xl border border-sidebar-hover text-sidebar-muted transition hover:bg-sidebar-hover hover:text-sidebar-text lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      {/* subtle separator */}
      <div className="mx-4 border-t border-sidebar-hover" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-5 pt-5">
        {sections.map((section, index) => (
          <div
            key={section.label || `section-${index}`}
            className={cn(index !== sections.length - 1 && 'mb-6')}
          >
            {section.label && (
              <div className="mb-2.5 flex items-center gap-3 px-3">
                <p className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-sidebar-muted">
                  {section.label}
                </p>

                <div className="h-px flex-1 bg-sidebar-hover" />
              </div>
            )}

            {section.items.map(([label, path, Icon]) => (
              <SidebarItem key={path} label={label} path={path} Icon={Icon} close={close} />
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="shrink-0 p-3 pt-0">
        <div className="rounded-[18px] border border-sidebar-hover bg-sidebar-hover p-3">
          <div className="flex items-center gap-3">
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-[11px] font-black text-sidebar shadow-sm">
              {initials}

              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-sidebar-text">
                {user?.fullName || 'Orbit user'}
              </p>

              <p className="mt-0.5 truncate text-[10px] text-sidebar-muted">{user?.email}</p>
            </div>

            <button
              type="button"
              title="Log out"
              aria-label="Log out"
              onClick={logout}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-sidebar-muted transition hover:border-sidebar-hover hover:bg-sidebar hover:text-sidebar-text"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function HeaderAction({ children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'relative grid h-10 w-10 place-items-center rounded-xl',
        'border border-border bg-surface/80 text-muted shadow-sm',
        'transition-all duration-200',
        'hover:-translate-y-px hover:border-primary/30 hover:text-primary hover:shadow-md',
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function Layout() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);

  const { setQuickAddOpen, darkMode, setSettings } = useApp();

  const location = useLocation();
  const outlet = useOutlet();

  useEffect(() => {
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearch(true);
      }

      const activeTag = document.activeElement?.tagName;

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.toLowerCase() === 'n' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)
      ) {
        event.preventDefault();
        setQuickAddOpen(true);
      }
    };

    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [setQuickAddOpen]);

  const toggleTheme = async () => {
    const mode = document.documentElement.classList.contains('dark') ? 'light' : 'dark';

    try {
      const response = await api.patch('/settings', {
        appearance: { mode },
      });

      setSettings(response.data);
    } catch {
      /* Settings remains authoritative if this shortcut cannot be saved. */
    }
  };

  return (
    <div className="relative min-h-screen bg-canvas">
      {/* Desktop / mobile sidebar */}
      <Sidebar open={menu} close={() => setMenu(false)} />

      {/* Mobile sidebar overlay */}
      {menu && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}

      <div className="lg:pl-[264px]">
        {/* HEADER */}
        <header className="sticky top-0 z-30 border-b border-border bg-canvas/85 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:h-20 lg:px-8">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMenu(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted shadow-sm transition hover:text-primary lg:hidden"
            >
              <Menu size={20} />
            </button>

            {/* Search */}
            <button
              type="button"
              onClick={() => setSearch(true)}
              className={cn(
                'group hidden h-11 w-[320px] items-center gap-3 rounded-[14px]',
                'border border-border bg-surface/70 px-2.5 pr-3 text-left shadow-sm',
                'transition-all duration-200',
                'hover:border-primary/30 hover:bg-surface hover:shadow-md',
                'md:flex',
              )}
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-canvas text-muted transition group-hover:text-primary">
                <Search size={15} />
              </div>

              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted">
                Search anything…
              </span>

              <span className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-canvas px-1.5 py-1 text-[9px] font-bold text-muted">
                <Command size={9} />K
              </span>
            </button>

            {/* Mobile search shortcut */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearch(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted shadow-sm md:hidden"
            >
              <Search size={17} />
            </button>

            <div className="ml-auto flex items-center gap-2">
              <HeaderAction onClick={toggleTheme} aria-label="Toggle theme">
                {darkMode ? <Sun size={17} /> : <Moon size={17} />}
              </HeaderAction>

              <HeaderAction aria-label="Notifications">
                <Bell size={17} />

                <span className="absolute right-[9px] top-[8px] h-1.5 w-1.5 rounded-full bg-danger ring-2 ring-surface" />
              </HeaderAction>

              <button
                type="button"
                onClick={() => setQuickAddOpen(true)}
                className={cn(
                  'ml-1 hidden h-10 items-center gap-2 rounded-xl px-4 sm:inline-flex',
                  'bg-primary text-[12px] font-black text-primary-text shadow-sm',
                  'transition-all duration-200',
                  'hover:-translate-y-px hover:brightness-105 hover:shadow-md',
                  'active:translate-y-0 active:scale-[0.98]',
                )}
              >
                <Plus size={16} strokeWidth={2.5} />
                Quick add
              </button>
            </div>
          </div>
        </header>

        {/* PAGE */}
        <main className="relative">
          {/* restrained ambient accent */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-52 overflow-hidden"
          >
            <div className="absolute left-1/4 top-[-130px] h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-[1500px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            <AnimatePresence mode="wait" initial={false}>
              <AnimatedPage key={location.pathname}>{outlet}</AnimatedPage>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* MOBILE NAV */}
      <nav
        className={cn(
          'fixed bottom-3 left-3 right-3 z-40 grid h-[66px] grid-cols-5',
          'rounded-[22px] border border-border bg-surface/95 px-2',
          'shadow-lift backdrop-blur-2xl',
          'lg:hidden',
        )}
      >
        {mobileItems.map(([label, path, Icon]) => {
          if (path === '#add') {
            return (
              <div key={path} className="relative flex items-center justify-center">
                <button
                  type="button"
                  aria-label="Quick add"
                  onClick={() => setQuickAddOpen(true)}
                  className={cn(
                    'absolute -top-4 grid h-[56px] w-[56px] place-items-center',
                    'rounded-[18px] border-4 border-canvas bg-primary text-primary-text',
                    'shadow-lift transition-all duration-200',
                    'active:scale-95',
                  )}
                >
                  <Plus size={23} strokeWidth={2.5} />
                </button>
              </div>
            );
          }

          return (
            <NavLink
              end={path === '/'}
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  'group relative flex flex-col items-center justify-center gap-1',
                  'rounded-xl text-[9px] font-bold transition-colors',
                  isActive ? 'text-primary' : 'text-muted hover:text-primary',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      'grid h-7 w-8 place-items-center rounded-lg transition-colors',
                      isActive && 'bg-primary/10',
                    )}
                  >
                    <Icon size={18} />
                  </div>

                  <span>{label}</span>

                  {isActive && (
                    <span className="absolute bottom-1 h-0.5 w-3 rounded-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <QuickAdd />

      <SearchPalette open={search} onClose={() => setSearch(false)} />
    </div>
  );
}
