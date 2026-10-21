import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../utils/format.js';
import { CheckCircle2, Send } from 'lucide-react';
import { Modal } from './ui.jsx';
import { useTelegram } from '../context/TelegramContext.js';

export function TelegramControl() {
  const { t: _t } = useTranslation();
  const { status, loading, setOpen } = useTelegram();
  return <button type="button" className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--orbit-control-radius)] border px-2 text-xs font-semibold sm:px-3 ${status?.connected ? 'border-success/30 bg-success/10 text-success' : 'border-primary/30 bg-selected text-primary'}`} onClick={() => setOpen(true)} aria-label={status?.connected ? 'Telegram linked, view connection' : 'Connect Telegram'}>
    {status?.connected ? <CheckCircle2 size={16} /> : <Send size={16} />}
    <span className="hidden md:inline">{loading ? _t('settings:ui.telegram') : status?.connected ? _t('settings:ui.telegramLinked') : _t('settings:ui.connectTelegram')}</span>
  </button>;
}

export function TelegramConnectionDialog() {
  const { t: _t } = useTranslation();
  const { status, loading, error, open, setOpen, link, busy, refresh, connect, disconnect } = useTelegram();
  const expired = link?.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
  return <Modal open={open} onClose={() => setOpen(false)} title={status?.connected ? _t('settings:ui.telegramLinked') : _t('settings:ui.connectTelegram')} description={_t('settings:ui.sendOrdinaryMessagesToOrbitFromTelegram')}>
    <div className="space-y-4 text-sm">
      {loading ? <p className="text-muted">{_t('settings:ui.checkingConnection')}</p> : status?.connected ? <>
        <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-success">{_t('settings:ui.yourTelegramAccountIsConnected')}{status.telegramUsername ? _t('common:dynamic.asUsername', { username: status.telegramUsername }) : ''}.</p>
        <p className="text-muted">{_t('settings:ui.youCanSendTasksRemindersMoneyEntriesAndOtherPermittedActionsToTh')}</p>
        <p className="text-xs text-muted">{_t('settings:ui.linked')}{' '}{status.linkedAt ? formatDateTime(status.linkedAt) : _t('common:dynamic.recently')}</p>
        <button className="btn-secondary" disabled={busy} onClick={disconnect}>{_t('settings:ui.disconnectTelegram')}</button>
      </> : <>
        <p className="text-muted">{_t('settings:ui.telegramIsAMessagingAppConnectingItLetsYouSendAMessageLikeTCallA')}</p>
        <button className="btn-primary" disabled={busy} onClick={connect}>{busy ? _t('settings:ui.preparingLink') : link ? _t('settings:ui.generateANewLink') : _t('settings:ui.openTelegramBot')}</button>
        {link && <div className="rounded-xl border border-border bg-surface-alt p-3"><p>{expired ? _t('settings:ui.thisLinkExpiredGenerateANewOne') : _t('settings:ui.completeTheConnectionInTelegramOrbitWillDetectItAutomatically')}</p><a className="mt-2 block break-all text-primary underline" href={link.url} target="_blank" rel="noopener noreferrer">{_t('settings:ui.openConnectionLink')}</a></div>}
        <button className="text-primary underline" onClick={refresh}>{_t('settings:ui.checkConnectionNow')}</button>
      </>}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  </Modal>;
}
