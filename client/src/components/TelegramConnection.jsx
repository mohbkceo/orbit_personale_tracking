import { CheckCircle2, Send } from 'lucide-react';
import { Modal } from './ui.jsx';
import { useTelegram } from '../context/TelegramContext.js';

export function TelegramControl() {
  const { status, loading, setOpen } = useTelegram();
  return <button type="button" className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--orbit-control-radius)] border px-2 text-xs font-semibold sm:px-3 ${status?.connected ? 'border-success/30 bg-success/10 text-success' : 'border-primary/30 bg-selected text-primary'}`} onClick={() => setOpen(true)} aria-label={status?.connected ? 'Telegram linked, view connection' : 'Connect Telegram'}>
    {status?.connected ? <CheckCircle2 size={16} /> : <Send size={16} />}
    <span className="hidden md:inline">{loading ? 'Telegram…' : status?.connected ? 'Telegram Linked' : 'Connect Telegram'}</span>
  </button>;
}

export function TelegramConnectionDialog() {
  const { status, loading, error, open, setOpen, link, busy, refresh, connect, disconnect } = useTelegram();
  const expired = link?.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
  return <Modal open={open} onClose={() => setOpen(false)} title={status?.connected ? 'Telegram linked' : 'Connect Telegram'} description="Send ordinary messages to Orbit from Telegram.">
    <div className="space-y-4 text-sm">
      {loading ? <p className="text-muted">Checking connection…</p> : status?.connected ? <>
        <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-success">Your Telegram account is connected{status.telegramUsername ? ` as @${status.telegramUsername}` : ''}.</p>
        <p className="text-muted">You can send tasks, reminders, money entries and other permitted actions to the Orbit bot. Your current plan controls which actions are available.</p>
        <p className="text-xs text-muted">Linked {status.linkedAt ? new Date(status.linkedAt).toLocaleString() : 'recently'}</p>
        <button className="btn-secondary" disabled={busy} onClick={disconnect}>Disconnect Telegram</button>
      </> : <>
        <p className="text-muted">Telegram is a messaging app. Connecting it lets you send a message like “t Call Alex tomorrow” to save it in your Orbit workspace. Your Orbit account stays private.</p>
        <button className="btn-primary" disabled={busy} onClick={connect}>{busy ? 'Preparing link…' : link ? 'Generate a new link' : 'Open Telegram bot'}</button>
        {link && <div className="rounded-xl border border-border bg-surface-alt p-3"><p>{expired ? 'This link expired. Generate a new one.' : 'Complete the connection in Telegram. Orbit will detect it automatically.'}</p><a className="mt-2 block break-all text-primary underline" href={link.url} target="_blank" rel="noopener noreferrer">Open connection link</a></div>}
        <button className="text-primary underline" onClick={refresh}>Check connection now</button>
      </>}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  </Modal>;
}
