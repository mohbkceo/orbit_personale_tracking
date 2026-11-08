import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { errorMessage } from '../broadcastModel.js';
import Dialog from './Dialog.jsx';

const triggers = { REGISTRATION: 'When a user registers', SUBSCRIPTION_ACTIVATED: 'When a subscription is activated', BEFORE_EXPIRY: 'Before a subscription expires', AFTER_EXPIRY: 'After a subscription expires', SCHEDULED: 'At a scheduled date/time' };
const newMessage = () => ({ order: 0, text: '', imageId: null, buttons: [], delayMinutes: 0 });
const newAutomation = () => ({ name: '', enabled: false, promotional: false, trigger: { type: 'REGISTRATION', configuration: {} }, audience: { type: 'ALL', planIds: [] }, messages: [newMessage()] });
const payload = (draft, enabled = draft.enabled) => ({ name: draft.name, enabled, promotional: draft.promotional, trigger: draft.trigger, audience: draft.audience, messages: draft.messages.map((message, order) => ({ ...message, order })) });
const localDate = (value) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function Duration({ label, value, onChange, min = 0 }) {
  const unit = value && value % 1440 === 0 ? 1440 : value && value % 60 === 0 ? 60 : 1;
  const [scale, setScale] = useState(unit);
  return <div><label className="label">{label}</label><div className="flex gap-2"><input className="field w-28" type="number" aria-label={label} min={min / scale} max={525600 / scale} step={scale === 1 ? 1 : 'any'} value={value / scale} onChange={(event) => onChange(Math.round(Number(event.target.value) * scale))} /><select className="field w-32" aria-label={`${label} unit`} value={scale} onChange={(event) => { const next = Number(event.target.value); onChange(Math.round(value / scale * next)); setScale(next); }}><option value={1}>Minutes</option><option value={60}>Hours</option><option value={1440}>Days</option></select></div></div>;
}

function Editor({ initial, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [index, setIndex] = useState(0);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    let active = true;
    api.get('/admin/broadcast-audience/plans').then((result) => { if (active) setPlans(result.data); }).catch((failure) => { if (active) setError(errorMessage(failure)); });
    if (initial._id) api.get(`/admin/custom-automations/${initial._id}/executions`).then((result) => { if (active) setActivity(result.data); }).catch((failure) => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, [initial._id]);
  useEffect(() => {
    let active = true;
    setPreview(null); setPreviewError('');
    const timer = setTimeout(() => {
      api.post('/admin/custom-automations/preview', { automation: payload(draft), messageIndex: index })
        .then((result) => { if (active) setPreview(result.data); })
        .catch((failure) => { if (active) setPreviewError(errorMessage(failure)); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [draft, index]);
  const updateMessage = (at, patch) => setDraft((current) => ({ ...current, messages: current.messages.map((message, i) => i === at ? { ...message, ...patch } : message) }));
  function trigger(type) {
    setDraft((current) => ({ ...current, trigger: { type, configuration: type === 'BEFORE_EXPIRY' ? { leadMinutes: 4320 } : {} }, audience: { type: 'ALL', planIds: [] } }));
  }
  function reorder(at, to) {
    setDraft((current) => { const messages = [...current.messages]; const [message] = messages.splice(at, 1); messages.splice(to, 0, message); return { ...current, messages }; }); setIndex(to);
  }
  async function upload(at, file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPG, PNG, or WebP image up to 5 MB.'); return; }
    setBusy(true); setError('');
    try { const result = await api.post('/admin/broadcasts/media', file, { headers: { 'Content-Type': file.type }, timeout: 30000 }); updateMessage(at, { imageId: result.data.imageId }); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function save(enabled) {
    setBusy(true); setError('');
    try {
      const body = payload(draft, enabled);
      if (initial._id) await api.put(`/admin/custom-automations/${initial._id}`, body);
      else await api.post('/admin/custom-automations', body);
      onSaved();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setNotice('');
    try { await api.post('/admin/custom-automations/test', { automation: payload(draft), messageIndex: index }); setNotice('Test sent to your Telegram account.'); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <Dialog title={initial._id ? 'Edit Automation' : 'New Automation'} onClose={onClose} busy={busy} wide>
    <form onSubmit={(event) => { event.preventDefault(); save(true); }}>
      <fieldset className="min-w-0 space-y-4 p-5" disabled={busy}>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
        <label className="block"><span className="label">Automation Name</span><input className="field" autoFocus required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="block"><span className="label">When to Start</span><select className="field" value={draft.trigger.type} onChange={(event) => trigger(event.target.value)}>{Object.entries(triggers).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {draft.trigger.type === 'BEFORE_EXPIRY' && <Duration label="Start before expiry" min={1} value={draft.trigger.configuration.leadMinutes} onChange={(leadMinutes) => setDraft({ ...draft, trigger: { ...draft.trigger, configuration: { leadMinutes } } })} />}
        {draft.trigger.type === 'SCHEDULED' && <label className="block"><span className="label">Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</span><input className="field" type="datetime-local" required value={localDate(draft.trigger.configuration.scheduledAt)} onChange={(event) => setDraft({ ...draft, trigger: { ...draft.trigger, configuration: { scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : undefined } } })} /></label>}
        <label className="block"><span className="label">Who Receives It</span><select className="field" value={draft.audience.type} onChange={(event) => setDraft({ ...draft, audience: { type: event.target.value, planIds: [] } })}><option value="ALL">All applicable Telegram users</option>{!['BEFORE_EXPIRY', 'SUBSCRIPTION_ACTIVATED'].includes(draft.trigger.type) && <option value="FREE">Free users</option>}{draft.trigger.type !== 'AFTER_EXPIRY' && <><option value="ACTIVE">Active subscribers</option><option value="PLANS">Specific plans</option></>}</select></label>
        {draft.audience.type === 'PLANS' && <div className="flex flex-wrap gap-3">{plans.map((plan) => <label key={plan._id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.audience.planIds.includes(plan._id)} onChange={(event) => setDraft({ ...draft, audience: { ...draft.audience, planIds: event.target.checked ? [...draft.audience.planIds, plan._id] : draft.audience.planIds.filter((id) => id !== plan._id) } })} />{plan.name}</label>)}</div>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.promotional} onChange={(event) => setDraft({ ...draft, promotional: event.target.checked })} />Promotional messages (requires opt-in)</label>
        <p className="text-xs text-muted">Every delay is measured from the automation start. Subscription automations run once per subscription cycle. Only connected, permitted users receive messages.</p>
        {draft.messages.map((message, at) => <section className="space-y-3 rounded-xl border border-border p-4" key={at} aria-label={`Message ${at + 1}`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>Message {at + 1}</strong><div className="flex gap-3 text-xs text-primary"><button type="button" disabled={at === 0} onClick={() => reorder(at, at - 1)} aria-label={`Move message ${at + 1} up`}>Up</button><button type="button" disabled={at === draft.messages.length - 1} onClick={() => reorder(at, at + 1)} aria-label={`Move message ${at + 1} down`}>Down</button><button type="button" disabled={draft.messages.length >= 20} onClick={() => { setDraft({ ...draft, messages: [...draft.messages.slice(0, at + 1), structuredClone(message), ...draft.messages.slice(at + 1)] }); setIndex(at + 1); }}>Duplicate</button><button type="button" disabled={draft.messages.length <= 1} onClick={() => { setDraft({ ...draft, messages: draft.messages.filter((_, i) => i !== at) }); setIndex(0); }}>Remove</button></div></div>
          <label className="block"><span className="label">Text</span><textarea className="field min-h-28" required maxLength={6000} value={message.text} onFocus={() => setIndex(at)} onChange={(event) => updateMessage(at, { text: event.target.value })} /></label>
          <Duration key={`${at}:${message.order}`} label={`Delay for message ${at + 1}`} value={message.delayMinutes} onChange={(delayMinutes) => updateMessage(at, { delayMinutes })} />
          <p className="text-xs text-muted">{message.delayMinutes === 0 ? 'Send immediately when the automation starts.' : 'After the automation starts, independent of other messages.'}</p>
          <label className="inline-block cursor-pointer text-sm text-primary underline">{message.imageId ? 'Replace image' : 'Add image'}<input className="sr-only" aria-label={`Image for message ${at + 1}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload(at, event.target.files?.[0])} /></label>
          {message.imageId && <div className="flex gap-3"><img className="max-h-32 rounded-lg" src={`/api/admin/broadcasts/media/${message.imageId}`} alt={`Message ${at + 1} attachment`} /><button type="button" onClick={() => updateMessage(at, { imageId: null })}>Remove image</button></div>}
          {message.buttons.length ? <div className="flex flex-wrap gap-2"><input className="field flex-1" aria-label={`Button label for message ${at + 1}`} placeholder="Button label" maxLength={64} required value={message.buttons[0][0].label} onChange={(event) => updateMessage(at, { buttons: [[{ ...message.buttons[0][0], label: event.target.value }]] })} /><input className="field flex-1" aria-label={`Button link for message ${at + 1}`} placeholder="https://…" type="url" pattern="https://.*" required value={message.buttons[0][0].url} onChange={(event) => updateMessage(at, { buttons: [[{ ...message.buttons[0][0], url: event.target.value }]] })} /><button type="button" onClick={() => updateMessage(at, { buttons: [] })}>Remove link</button></div> : <button type="button" className="ml-4 text-sm text-primary underline" onClick={() => updateMessage(at, { buttons: [[{ label: '', url: '' }]] })}>Add link button</button>}
        </section>)}
        <button type="button" className="btn-secondary" disabled={draft.messages.length >= 20} onClick={() => { setDraft({ ...draft, messages: [...draft.messages, { ...newMessage(), order: draft.messages.length }] }); setIndex(draft.messages.length); }}>+ Add Message</button>
        <div className="space-y-2 rounded-xl bg-surface-alt p-4"><label className="label">Telegram preview<select className="field mt-1" value={index} onChange={(event) => setIndex(Number(event.target.value))}>{draft.messages.map((_, at) => <option key={at} value={at}>Message {at + 1}</option>)}</select></label>{previewError ? <p className="text-xs text-muted">{previewError}</p> : preview ? <div aria-live="polite">{preview.photo && draft.messages[index].imageId && <img className="max-h-36 rounded-lg" alt="Preview attachment" src={`/api/admin/broadcasts/media/${draft.messages[index].imageId}`} />}<p className="whitespace-pre-wrap break-words text-sm" dangerouslySetInnerHTML={{ __html: preview.text?.text || preview.photo?.caption || '' }} />{(preview.text?.keyboard || preview.photo?.keyboard)?.inline_keyboard.map((row, at) => <div className="mt-2 flex gap-2" key={at}>{row.map((button, inner) => <span className="rounded border border-border px-2 py-1 text-xs" key={inner}>{button.text}</span>)}</div>)}</div> : <p className="text-xs text-muted">Updating preview…</p>}<button type="button" className="btn-secondary" disabled={!preview} onClick={test}>Send Test</button></div>
        {initial._id && <details className="text-xs text-muted"><summary>Recent delivery activity</summary>{activity.length ? activity.map((entry) => <p className="mt-2" key={entry._id}>Message {entry.messageIndex + 1} · {entry.status} · {new Date(entry.scheduledAt).toLocaleString()}{entry.lastError ? ` · ${entry.lastError}` : ''}</p>) : <p className="mt-2">No executions yet.</p>}</details>}
        {initial._id && <p className="text-xs text-muted">Saving changes cancels pending messages. The updated automation applies to future starts.</p>}
      </fieldset>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-surface p-4"><button type="button" className="btn-secondary" disabled={busy} onClick={() => save(false)}>Save as Draft</button><button type="submit" className="btn-primary" disabled={busy}>{initial.enabled ? 'Save and Enable' : 'Enable Automation'}</button></footer>
    </form>
  </Dialog>;
}

export default function CustomAutomations({ canEdit }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try { const result = await api.get('/admin/custom-automations'); setRows(Array.isArray(result.data) ? result.data : []); }
    catch (failure) { setError(errorMessage(failure)); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  async function toggle(row, enabled) {
    setBusy(true); setError('');
    try { await api.patch(`/admin/custom-automations/${row._id}/enabled`, { enabled }); await reload(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Custom Automations</h2>{canEdit && <button type="button" className="btn-primary" onClick={() => setEditing(newAutomation())}>+ New Automation</button>}</div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="panel divide-y divide-border">{rows.length ? rows.map((row) => <div key={row._id} className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><strong className="block text-sm">{row.name}</strong><span className="text-xs text-muted">{triggers[row.trigger.type]} · {row.messages.length} {row.messages.length === 1 ? 'message' : 'messages'}</span></div><input type="checkbox" role="switch" aria-label={`Enable ${row.name}`} checked={row.enabled} disabled={!canEdit || busy} onChange={(event) => toggle(row, event.target.checked)} />{canEdit && <button type="button" className="text-sm text-primary" onClick={() => setEditing(row)}>Edit</button>}</div>) : <p className="p-4 text-sm text-muted">Create an automation with one or more Telegram messages.</p>}</div>{editing && <Editor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}</section>;
}
