import { LoaderCircle, X } from 'lucide-react';
import { cn, formatMoney } from '../utils/format.js';

export function PageHeader({ eyebrow, title, description, actions }) {
  return <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow mb-2">{eyebrow}</p><h1 className="font-display text-3xl font-bold tracking-tight sm:text-[34px]">{title}</h1>{description && <p className="mt-1.5 max-w-2xl text-sm text-[#6d7871] dark:text-[#a4afa8]">{description}</p>}</div>{actions && <div className="flex gap-2">{actions}</div>}</header>;
}

export function Modal({ open, onClose, title, description, children, wide = false }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#07110c]/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section role="dialog" aria-modal="true" className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-lift dark:bg-[#151c18] sm:rounded-2xl sm:p-6', wide ? 'max-w-2xl' : 'max-w-lg')}><header className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-display text-xl font-bold">{title}</h2>{description && <p className="mt-1 text-sm text-[#6d7871] dark:text-[#9ca9a1]">{description}</p>}</div><button className="icon-btn -mr-1 -mt-1" onClick={onClose} aria-label="Close"><X size={19} /></button></header>{children}</section></div>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center"><div className="mb-4 rounded-2xl bg-[#eef3ed] p-3 text-accent dark:bg-white/5 dark:text-[#77d7ad]"><Icon size={25} /></div><h3 className="font-display font-bold">{title}</h3><p className="mt-1 max-w-sm text-sm text-[#78827c]">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function StatusBadge({ children, tone = 'neutral' }) {
  const colors = { success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300', danger: 'bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300', warning: 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300', info: 'bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300', neutral: 'bg-[#edf0ec] text-[#5d6962] dark:bg-white/10 dark:text-[#bdc6c0]' };
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize tracking-wide', colors[tone])}>{String(children).replaceAll('_', ' ')}</span>;
}

export function Money({ value, currency, signed, className }) {
  const amount = Number(value) || 0; return <span className={cn(signed && amount > 0 && 'text-emerald-600 dark:text-emerald-400', signed && amount < 0 && 'text-red-600 dark:text-red-400', className)}>{signed && amount > 0 ? '+' : ''}{formatMoney(amount, currency)}</span>;
}

export function Spinner({ label = 'Loading' }) { return <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[#738078]"><LoaderCircle className="animate-spin" size={20} />{label}</div>; }

export function ConfirmButton({ onConfirm, children = 'Delete', className }) {
  const handle = () => { if (window.confirm('This action cannot be reversed. Continue?')) onConfirm(); };
  return <button className={className || 'text-xs font-semibold text-red-600 hover:text-red-700'} onClick={handle}>{children}</button>;
}
