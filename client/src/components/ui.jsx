import { useOrbitReducedMotion } from '../animations/useOrbitReducedMotion.js';
import { LoaderCircle, X } from 'lucide-react';
import { cn, formatMoney } from '../utils/format.js';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { backdrop, modalDesktop, modalMobile, reduced } from '../animations/motionPresets.js';

export function PageHeader({ eyebrow, title, description, actions }) {
  return <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow mb-2">{eyebrow}</p><h1 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm text-muted ">{description}</p>}</div>{actions && <div className="flex gap-2">{actions}</div>}</header>;
}

export function Modal({ open, onClose, title, description, children, wide = false }) {
  const reduce = useOrbitReducedMotion();
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => { const media = window.matchMedia('(max-width: 639px)'); const change = () => setMobile(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => { if (!open) return undefined; const handle = (event) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle); }, [open, onClose]);
  return <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-5"><AnimatePresence>{open && [
    <motion.div key="backdrop" {...(reduce ? reduced(backdrop) : backdrop)} className="pointer-events-auto absolute inset-0 bg-sidebar/65 backdrop-blur-[2px]" onMouseDown={onClose} />,
    <motion.section key="dialog" {...(reduce ? reduced(modalDesktop) : mobile ? modalMobile : modalDesktop)} role="dialog" aria-modal="true" aria-label={title} className={cn('pointer-events-auto relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-lift  sm:rounded-2xl sm:p-6', wide ? 'max-w-2xl' : 'max-w-lg')}><header className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-xl font-bold">{title}</h2>{description && <p className="mt-1 text-sm text-muted ">{description}</p>}</div><button className="icon-btn -mr-1 -mt-1" onClick={onClose} aria-label="Close"><X size={19} /></button></header>{children}</motion.section>
  ]}</AnimatePresence></div>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center"><div className="mb-4 rounded-2xl bg-surface-alt p-3 text-primary  "><Icon size={25} /></div><h3 className="font-display font-bold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function StatusBadge({ children, tone = 'neutral' }) {
  const colors = { success: 'bg-success/10 text-success', danger: 'bg-danger/10 text-danger', warning: 'bg-warning/10 text-warning', info: 'bg-selected text-primary', neutral: 'bg-surface-alt text-muted' };
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize tracking-wide', colors[tone])}>{String(children).replaceAll('_', ' ')}</span>;
}

export function Money({ value, currency, signed, className }) {
  const amount = Number(value) || 0; return <span className={cn(signed && amount > 0 && 'text-success ', signed && amount < 0 && 'text-danger ', className)}>{signed && amount > 0 ? '+' : ''}{formatMoney(amount, currency)}</span>;
}

export function Spinner({ label = 'Loading' }) { return <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-muted"><LoaderCircle className="animate-spin" size={20} />{label}</div>; }

export function ConfirmButton({ onConfirm, children = 'Delete', className }) {
  const handle = () => { if (window.confirm('This action cannot be reversed. Continue?')) onConfirm(); };
  return <button className={className || 'text-xs font-semibold text-danger hover:text-danger'} onClick={handle}>{children}</button>;
}
