import { useState } from 'react';
import { api } from '../../../api/client.js';
import { useAdminAuth } from '../../../context/useAuth.js';
import { broadcastPayload, errorMessage, hasRecipients, presetSelection, recipientMode, validButtons } from '../broadcastModel.js';
import RecipientPicker from './RecipientPicker.jsx';
import Dialog from './Dialog.jsx';

export default function Composer({ initial, testRecipient, onClose, onSaved, onSent }) {
  const { admin } = useAdminAuth();
  const canSend = admin?.role === 'SUPER_ADMIN';
  const [form, setForm] = useState(() => structuredClone(initial));
  const [language, setLanguage] = useState('en');
  const [mode, setMode] = useState(() => recipientMode(initial.audience));
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const payload = broadcastPayload(form);
  const valid = Boolean(payload.variants.en.text && payload.variants.en.text.length <= 6000 && payload.variants.ar.text.length <= 6000 && validButtons(form.buttons) && hasRecipients(form.audience));
  const validSchedule = !schedule || Boolean(scheduledAt && new Date(scheduledAt).getTime() > Date.now());
  function changeButton(rowIndex, buttonIndex, patch) { setForm((current) => ({ ...current, buttons: current.buttons.map((row, index) => index === rowIndex ? row.map((button, inner) => inner === buttonIndex ? { ...button, ...patch } : button) : row) })); }
  async function persist() {
    const result = form._id ? await api.put(`/admin/broadcasts/${form._id}`, payload) : await api.post('/admin/broadcasts', payload);
    setForm((current) => ({ ...current, _id: result.data._id }));
    onSaved();
    return result.data;
  }
  async function action(kind) {
    if (busy || !valid || kind === 'send' && (!canSend || !password || !validSchedule)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await persist();
      if (kind === 'save') setNotice('Draft saved.');
      if (kind === 'test') { await api.post(`/admin/broadcasts/${saved._id}/test`, { recipientUserId: testRecipient.userId, language }); setNotice('Test sent to your Telegram account.'); }
      if (kind === 'send') {
        const result = await api.get(`/admin/broadcasts/${saved._id}/audience`);
        if (!result.data.deliverable) throw new Error('No eligible recipients. Choose another audience.');
        setConfirm({ id: saved._id, eligible: result.data.deliverable, excluded: result.data.targeted - result.data.deliverable });
      }
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function launch() {
    if (busy || !confirm || !validSchedule) return;
    setBusy(true); setError('');
    try {
      await api.post(`/admin/broadcasts/${confirm.id}/launch`, { confirmation: 'SEND', adminPassword: password, ...(schedule ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}) });
      onSent(schedule ? 'Broadcast scheduled.' : 'Broadcast queued for sending.');
    } catch (failure) { setConfirm(null); setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function upload(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image up to 5 MB.'); return; }
    setBusy(true); setError('');
    try { const result = await api.post('/admin/broadcasts/media', file, { headers: { 'Content-Type': file.type }, timeout: 30000 }); setForm((current) => ({ ...current, imageId: result.data.imageId })); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title={initial._id ? 'Edit Broadcast' : 'New Broadcast'} onClose={onClose} busy={busy} wide>
    <form onSubmit={(event) => { event.preventDefault(); action('send'); }}>
      <fieldset disabled={busy || Boolean(confirm)} className="min-w-0 space-y-5 px-5 py-4">
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        <section>
          <div className="mb-2 flex items-center justify-between gap-2"><label className="font-semibold" htmlFor="broadcast-message">Message</label><button type="button" className="text-xs text-primary underline" onClick={() => setLanguage((current) => current === 'en' ? 'ar' : 'en')}>{language === 'en' ? 'Arabic version (optional)' : 'Main message'}</button></div>
          <textarea id="broadcast-message" className="field min-h-44 text-base" autoFocus dir="auto" maxLength={6000} placeholder={language === 'ar' ? 'الرسالة بالعربية…' : 'Write your message…'} value={form.variants[language].text} onChange={(event) => setForm((current) => ({ ...current, variants: { ...current.variants, [language]: { text: event.target.value } } }))} />
          <p className="mt-1 text-xs text-muted">Telegram HTML supported: &lt;b&gt;bold&lt;/b&gt;, &lt;i&gt;italic&lt;/i&gt;, and HTTPS links.</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            <label className="cursor-pointer text-primary underline">{form.imageId ? 'Replace image' : 'Add image'}<input className="sr-only" aria-label="Upload image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
            <button type="button" className="text-primary underline" disabled={form.buttons.length >= 8} onClick={() => setForm((current) => ({ ...current, buttons: [...current.buttons, [{ label: '', url: '' }]] }))}>Add link button</button>
          </div>
          {form.imageId && <div className="mt-3 flex items-start gap-3"><img className="max-h-40 max-w-[75%] rounded-lg object-contain" src={`/api/admin/broadcasts/media/${form.imageId}`} alt="Broadcast attachment" /><button type="button" className="text-sm text-red-700 underline" onClick={() => setForm((current) => ({ ...current, imageId: null }))}>Remove image</button></div>}
          {form.buttons.map((row, rowIndex) => row.map((button, buttonIndex) => <div key={`${rowIndex}-${buttonIndex}`} className="mt-2 grid min-w-0 grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input className="field min-w-0" aria-label="Button label" placeholder="Button label" maxLength={64} required value={button.label} onChange={(event) => changeButton(rowIndex, buttonIndex, { label: event.target.value })} />
            {button.action ? <span className="self-center text-xs text-muted">{button.action === 'ACK' ? 'Acknowledgement' : 'Unsubscribe'}</span> : <input className="field col-start-1 row-start-2 min-w-0 sm:col-auto sm:row-auto" aria-label="Button URL" type="url" pattern="https://.*" required placeholder="https://…" value={button.url || ''} onChange={(event) => changeButton(rowIndex, buttonIndex, { url: event.target.value })} />}
            <button type="button" className="col-start-2 row-start-1 text-sm text-red-700 sm:col-auto sm:row-auto" aria-label={`Remove button ${button.label || rowIndex + 1}`} onClick={() => setForm((current) => ({ ...current, buttons: current.buttons.map((items, index) => index === rowIndex ? items.filter((_, inner) => inner !== buttonIndex) : items).filter((items) => items.length) }))}>Remove</button>
          </div>))}
        </section>
        <section><label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={['PROMOTION', 'CUSTOM'].includes(form.category)} onChange={(event) => setForm((current) => ({ ...current, category: event.target.checked ? 'PROMOTION' : 'ANNOUNCEMENT' }))} />Promotional message (requires opt-in)</label><label className="label" htmlFor="broadcast-recipients">Recipients</label><select id="broadcast-recipients" className="field" value={mode} onChange={(event) => { setMode(event.target.value); setForm((current) => ({ ...current, audience: presetSelection(event.target.value) })); }}><option value="all">All Telegram Users</option><option value="active">Active Subscribers</option><option value="free">Free Users</option><option value="select">Select Users</option></select>
          {mode === 'select' && <RecipientPicker key={initial._id || 'new'} selection={form.audience} promotional={['PROMOTION', 'CUSTOM'].includes(form.category)} onChange={(audience) => setForm((current) => ({ ...current, audience }))} />}
        </section>
        {canSend && <section className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={schedule} onChange={(event) => setSchedule(event.target.checked)} />Schedule for later</label>{schedule && <label className="block text-sm"><span className="label">Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span><input className="field" type="datetime-local" aria-label="Scheduled time" required value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>}<label className="block text-sm"><span className="label">Confirm admin password to send</span><input className="field" type="password" autoComplete="current-password" maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} /></label></section>}
      </fieldset>
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-5 py-4">
        <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={busy || !valid || Boolean(confirm)} onClick={() => action('save')}>Save draft</button><button type="button" className="btn-secondary" disabled={busy || !valid || !testRecipient?.userId || Boolean(confirm)} title={testRecipient?.userId ? 'Send to your Telegram account' : 'Link the user account matching your admin email to Telegram first'} onClick={() => action('test')}>Send Test</button></div>
        {canSend && <button type="submit" className="btn-primary" disabled={busy || !valid || !validSchedule || !password || Boolean(confirm)}>{busy ? 'Working…' : schedule ? 'Schedule' : 'Send Now'}</button>}
      </footer>
    </form>
    {confirm && <Dialog title={`Send this broadcast to ${confirm.eligible} eligible users?`} onClose={() => setConfirm(null)} busy={busy}><div className="space-y-4 p-5"><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Eligible recipients</dt><dd>{confirm.eligible}</dd></div><div className="flex justify-between gap-3"><dt>Excluded / unavailable</dt><dd>{confirm.excluded}</dd></div></dl><div className="flex justify-end gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="btn-primary" disabled={busy || !validSchedule} onClick={launch}>{busy ? 'Sending…' : 'Send'}</button></div></div></Dialog>}
  </Dialog>;
}
