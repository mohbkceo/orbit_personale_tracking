import { LogOut } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { adminNavigation } from './navigation.js';

export function AdminSidebar({ admin, onLogout, onNavigate }) {
  return <div className="admin-sidebar flex h-full min-h-0 flex-col bg-white">
    <Link to="/admin" onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
      <img src="/logo-orbit.png" alt="" className="h-9 w-9 object-contain" />
      <span className="font-display text-base font-bold text-text">Orbit <span className="text-primary">Admin</span></span>
    </Link>
    <nav aria-label="Admin navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
      {adminNavigation.map((group) => {
        const items = group.items.filter((item) => !item.superOnly || admin?.role === 'SUPER_ADMIN');
        return items.length ? <div key={group.label} className="mb-5">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.12em] text-muted">{group.label}</p>
          <div className="space-y-0.5">{items.map(({ label, to, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-md px-3 text-[13px] font-semibold transition-colors ${isActive ? 'bg-selected text-primary' : 'text-muted hover:bg-hover hover:text-text'}`}><Icon size={17} strokeWidth={1.9} aria-hidden="true" />{label}</NavLink>)}</div>
        </div> : null;
      })}
    </nav>
    <div className="shrink-0 border-t border-border p-3">
      <div className="min-w-0 px-3 py-2"><p className="truncate text-sm font-semibold text-text">{admin?.fullName}</p><p className="text-[11px] font-medium text-muted">{admin?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</p></div>
      <button type="button" onClick={onLogout} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-muted hover:bg-hover hover:text-text"><LogOut size={17} />Log out</button>
    </div>
  </div>;
}
