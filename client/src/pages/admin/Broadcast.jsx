import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAdminAuth } from '../../context/useAuth.js';
import { PageHeader, Spinner, StatusBadge } from '../../components/ui.jsx';
import { broadcastStatus, errorMessage, firstLine, newBroadcast } from './broadcastModel.js';
import Composer from './broadcast/Composer.jsx';
import Dialog from './broadcast/Dialog.jsx';
import AutoMessages from './broadcast/AutoMessages.jsx';

const inProgress = (row) => ['PREPARING', 'SCHEDULED', 'SENDING', 'PAUSED'].includes(row.status);
const date = (row) => new Date(row.scheduledAt || row.launchedAt || row.createdAt).toLocaleString();

function Broadcasts() {
  const { admin } = useAdminAuth();
  const canSend = admin?.role === 'SUPER_ADMIN';
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  const [testRecipient, setTestRecipient] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async (page = 1) => {
    try { const response = await api.get('/admin/broadcasts', { params: { page } }); setRows(response.data); setPagination(response.pagination); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); api.get('/admin/broadcasts/test-recipient').then((response) => setTestRecipient(response.data)).catch((failure) => setError(errorMessage(failure))); }, [load]);
  const live = rows.some(inProgress) || Boolean(selected && inProgress(selected));
  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => {
      load(pagination.page);
      if (selected?._id) api.get(`/admin/broadcasts/${selected._id}`).then((response) => setSelected(response.data)).catch((failure) => setError(errorMessage(failure)));
    }, 5000);
    return () => clearInterval(timer);
  }, [live, pagination.page, selected?._id, load]);
  async function open(id) {
    setBusy(true); setError('');
    try {
      const response = await api.get(`/admin/broadcasts/${id}`);
      if (response.data.status === 'DRAFT') setComposer(response.data);
      else {
        const rendered = await api.post(`/admin/broadcasts/${id}/preview`, { language: 'en' });
        setSelected(response.data); setPreview(rendered.data);
      }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function action(kind) {
    setBusy(true); setError('');
    try {
      const response = await api.post(`/admin/broadcasts/${selected._id}/${kind}`);
      if (kind === 'duplicate') { setSelected(null); setComposer(response.data); }
      else {
        const updated = await api.get(`/admin/broadcasts/${selected._id}`);
        setSelected(updated.data);
        setNotice(({ cancel: 'Broadcast cancelled.', pause: 'Broadcast paused.', resume: 'Broadcast resumed.', retry: response.data.queued ? 'Failed recipients queued for retry.' : 'No failed recipients can be retried safely.' })[kind]);
      }
      setConfirm(null); await load(pagination.page);
    } catch (failure) { setError(errorMessage(failure)); setConfirm(null); }
    finally { setBusy(false); }
  }
  return <>
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Broadcast history</h2><button className="btn-primary" onClick={() => { setNotice(''); setComposer(newBroadcast()); }}>New Broadcast</button></div>
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}{notice && <p role="status" className="mb-4 text-sm text-emerald-700">{notice}</p>}
    {loading ? <Spinner /> : <div className="panel divide-y divide-border overflow-hidden">{rows.length ? rows.map((row) => <button type="button" disabled={busy} className="flex w-full min-w-0 flex-col gap-2 p-4 text-start hover:bg-surface-alt sm:flex-row sm:items-center sm:justify-between" key={row._id} onClick={() => open(row._id)}>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{firstLine(row)}</strong><time className="text-xs text-muted">{date(row)}</time></span>
      <span className="flex flex-wrap items-center gap-3 text-xs"><StatusBadge tone={row.status === 'FAILED' ? 'danger' : row.status === 'COMPLETED' ? 'success' : 'neutral'}>{broadcastStatus(row)}</StatusBadge><span className="text-muted">{row.status === 'DRAFT' ? 'Recipients counted before sending' : `${row.stats?.eligible || 0} recipients`}{row.status !== 'DRAFT' && ` · ${row.stats?.sent || 0} sent · ${row.stats?.failed || 0} failed`}</span></span>
    </button>) : <p className="p-8 text-center text-sm text-muted">No broadcasts yet. Send your first message.</p>}</div>}
    {pagination.pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" className="btn-secondary" disabled={busy || pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</button><span>{pagination.page} / {pagination.pages}</span><button type="button" className="btn-secondary" disabled={busy || pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>Next</button></div>}
    {composer && <Composer initial={composer} testRecipient={testRecipient} onClose={() => setComposer(null)} onSaved={() => load(pagination.page)} onSent={(text) => { setComposer(null); setNotice(text); load(pagination.page); }} />}
    {selected && <Dialog title="Broadcast details" onClose={() => { if (!confirm) setSelected(null); }} busy={busy} wide><div className="space-y-4 p-5">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge>{broadcastStatus(selected)}</StatusBadge><time className="text-xs text-muted">{date(selected)}</time></div>
      {selected.imageId && <img className="max-h-64 max-w-full rounded-xl object-contain" src={`/api/admin/broadcasts/media/${selected.imageId}`} alt="Broadcast attachment" />}
      <div className="whitespace-pre-wrap break-words text-sm" dir="auto" dangerouslySetInnerHTML={{ __html: preview?.photo?.caption || preview?.text?.text || '' }} />
      {(preview?.photo?.keyboard || preview?.text?.keyboard)?.inline_keyboard?.map((row, index) => <div className="flex flex-wrap gap-2" key={index}>{row.map((button, inner) => <span key={inner} className="rounded-lg border border-border px-3 py-2 text-sm">{button.text}</span>)}</div>)}
      <p className="text-sm text-muted">{selected.stats?.eligible || 0} recipients · {selected.stats?.sent || 0} sent · {selected.stats?.failed || 0} failed</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => action('duplicate')}>Duplicate broadcast</button>
        {canSend && (selected.status === 'SENDING' || selected.status === 'PREPARING' && !selected.scheduledAt) && <button className="btn-secondary" disabled={busy} onClick={() => action('pause')}>Pause</button>}
        {canSend && selected.status === 'PAUSED' && <button className="btn-secondary" disabled={busy} onClick={() => action('resume')}>Resume</button>}
        {canSend && inProgress(selected) && <button className="btn-secondary" disabled={busy} onClick={() => setConfirm('cancel')}>Cancel broadcast</button>}
        {canSend && ['COMPLETED', 'SENDING', 'FAILED'].includes(selected.status) && (selected.stats?.failed > 0 || selected.status === 'FAILED') && <button className="btn-secondary" disabled={busy} onClick={() => setConfirm('retry')}>Retry failed recipients</button>}
      </div>
    </div>{confirm && <Dialog title={confirm === 'cancel' ? 'Cancel this broadcast?' : 'Retry failed recipients?'} busy={busy} onClose={() => setConfirm(null)}><div className="flex justify-end gap-2 p-5"><button className="btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>Back</button><button className="btn-primary" disabled={busy} onClick={() => action(confirm)}>{busy ? 'Working…' : confirm === 'cancel' ? 'Cancel broadcast' : 'Retry'}</button></div></Dialog>}</Dialog>}
  </>;
}

export default function AdminBroadcast() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('section') === 'auto' ? 'auto' : 'broadcasts';
  return <><PageHeader title="Broadcast" description="Send Telegram messages and manage automatic reminders." /><div className="mb-5 flex gap-2" role="tablist" aria-label="Broadcast sections">{[['broadcasts', 'Broadcasts'], ['auto', 'Auto Messages']].map(([id, name]) => <button type="button" id={`broadcast-tab-${id}`} aria-controls={`broadcast-panel-${id}`} key={id} role="tab" aria-selected={tab === id} className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-primary text-white' : 'bg-surface text-muted'}`} onClick={() => setParams(id === 'auto' ? { section: 'auto' } : {})}>{name}</button>)}</div><div id={`broadcast-panel-${tab}`} role="tabpanel" aria-labelledby={`broadcast-tab-${tab}`}>{tab === 'broadcasts' ? <Broadcasts /> : <AutoMessages />}</div></>;
}
