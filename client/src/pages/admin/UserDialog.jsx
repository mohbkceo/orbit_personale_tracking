import { useEffect, useRef } from 'react';

export function UserDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const prior = document.activeElement;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    dialog.current?.querySelector('button, input, select, textarea')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prior?.focus?.();
    };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-2xl rounded-2xl border border-border bg-white p-5 text-text shadow-xs sm:p-7"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const focusable = [
            ...event.currentTarget.querySelectorAll(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
            ),
          ];
          if (!focusable.length) return;
          if (event.shiftKey && document.activeElement === focusable[0]) {
            event.preventDefault();
            focusable.at(-1).focus();
          }
          if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
            event.preventDefault();
            focusable[0].focus();
          }
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
export function Message({ error, success }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
      {error}
    </p>
  ) : success ? (
    <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
      {success}
    </p>
  ) : null;
}
