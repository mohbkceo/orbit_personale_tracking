import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar.jsx';

export function AdminMobileDrawer({ open, onClose, admin, onLogout }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll('.admin-mobile-drawer a, .admin-mobile-drawer button')].filter((node) => !node.disabled);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', onKeyDown); previous?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close admin navigation" /><div role="dialog" aria-modal="true" aria-label="Admin navigation" className="admin-mobile-drawer absolute inset-y-0 left-0 w-[min(280px,calc(100vw-40px))] border-r border-border bg-white shadow-lg"><AdminSidebar admin={admin} onLogout={onLogout} onNavigate={onClose} /><button ref={closeRef} type="button" onClick={onClose} aria-label="Close admin navigation" className="absolute right-2 top-3 flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-hover"><X size={19} /></button></div></div>;
}
