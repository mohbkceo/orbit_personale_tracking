import { Menu } from 'lucide-react';
import { adminPageLabel } from './navigation.js';

export function AdminHeader({ admin, pathname, onOpenMenu }) {
  const label = adminPageLabel(pathname);
  const initials = (admin?.fullName || 'Admin').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <header className="admin-header flex h-16 items-center justify-between gap-3 border-b border-border bg-white px-4 sm:px-6 lg:px-8">
    <div className="flex min-w-0 items-center gap-3">
      <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover lg:hidden" aria-label="Open admin navigation" onClick={onOpenMenu}><Menu size={20} /></button>
      <div className="min-w-0 text-sm"><span className="hidden text-muted sm:inline">Orbit Admin <span className="mx-2">/</span></span><span className="truncate font-semibold text-text">{label}</span></div>
    </div>
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-alt text-xs font-bold text-text" aria-label={`Signed in as ${admin?.fullName || 'Admin'}`} title={admin?.fullName}>{initials}</div>
  </header>;
}
