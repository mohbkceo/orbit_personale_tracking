import { Bot, ContactRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const sections = [
  { to: '/admin/settings/automation', label: 'Automation', icon: Bot },
  { to: '/admin/settings/sales-contact', label: 'Sales / Contact', icon: ContactRound },
];

export default function AdminSettingsLayout() {
  return <div className="min-w-0">
    <header className="mb-6"><p className="eyebrow mb-2">System</p><h1 className="font-display text-[27px] font-bold tracking-tight sm:text-[30px]">Settings</h1><p className="mt-1 text-sm text-muted">Manage platform automation and public contact options.</p></header>
    <div className="grid min-w-0 gap-5 md:grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Admin settings" className="admin-settings-nav panel-flat flex h-fit gap-1 overflow-x-auto p-2 md:flex-col">
        {sections.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-3 text-sm font-semibold ${isActive ? 'bg-selected text-primary' : 'text-muted hover:bg-hover hover:text-text'}`}><Icon size={17} />{label}</NavLink>)}
      </nav>
      <div className="min-w-0"><Outlet /></div>
    </div>
  </div>;
}
