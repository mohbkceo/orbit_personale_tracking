import { useEffect, useId, useRef } from 'react';

export default function Dialog({ title, onClose, busy = false, children, wide = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    const parentDialog = dialog.parentElement?.closest('dialog');
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      const target = opener?.isConnected && opener !== document.body && !opener.disabled
        ? opener : parentDialog?.querySelector('textarea, input, button:not([disabled])');
      target?.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className={`fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-black/40 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
    <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><h2 id={titleId} className="font-display text-lg font-bold">{title}</h2><button type="button" className="icon-btn shrink-0" disabled={busy} aria-label={`Close ${title}`} onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}
