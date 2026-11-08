import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client.js';
import { useAdminAuth } from '../../../context/useAuth.js';
import { Spinner } from '../../../components/ui.jsx';
import { errorMessage } from '../broadcastModel.js';

const groups = [
  ['Task Reminders / Digest', ['TASKS', 'REMINDER']], ['Daily Focus', ['FOCUS']], ['Debt & Bill Reminders', ['DEBT', 'BILL']], ['Subscription Reminders', ['SUBSCRIPTION']], ['Goal Reviews', ['GOAL']], ['Event Notifications', ['EVENT']], ['Daily Summaries', ['SUMMARY']],
];
const stages = {
  'task-digest': ['Task digest', 'A grouped list of tasks to work on.'],
  'focus-morning': ['Morning reminder', 'Help users choose their focus for today.'],
  'focus-followup': ['Planning follow-up', 'A reminder to finish planning.'],
  'focus-evening': ['Evening review', 'Review today’s progress.'],
  'debt-prepare': ['Debt · Before due date', 'Prepare for an upcoming payment.'],
  'debt-act': ['Debt · On due date', 'A payment is due today.'],
  'debt-follow_up': ['Debt · After due date', 'Follow up on an unpaid debt.'],
  'bill-prepare': ['Bill · Before due date', 'Prepare for an upcoming bill.'],
  'bill-act': ['Bill · On due date', 'A bill is due today.'],
  'bill-follow_up': ['Bill · After due date', 'Follow up on an unpaid bill.'],
  'subscription-renewal': ['Subscription renewal', 'Remind users before renewal.'],
  'goal-review': ['Goal review', 'Check progress toward a goal.'],
  'event-followed': ['Followed events', 'Remind users about events they follow.'],
  'event-discovery': ['New events', 'Share events matching user interests.'],
  'event-change': ['Event updates', 'Let followers know about changes.'],
  'summary-morning': ['Morning summary', 'A quick overview to start the day.'],
  'summary-daily': ['Daily summary', 'A recap of tasks and money.'],
  'reminder-generic': ['Task reminders', 'Remind users about a task or deadline.'],
  'reminder-followup': ['Reminder follow-up', 'Follow up on unfinished items.'],
};
const labels = { legacyTitle: 'Reminder heading', legacyMessage: 'Reminder details', taskTitle: 'Task', priority: 'Priority', dueDate: 'Due date', amount: 'Amount', remainingAmount: 'Remaining amount', currency: 'Currency', personName: 'Person', billName: 'Bill', subscriptionName: 'Subscription', renewalDate: 'Renewal date', goalTitle: 'Goal', progressPercent: 'Progress', targetDate: 'Target date', eventName: 'Event', eventDate: 'Event date', venue: 'Venue', openTasks: 'Open tasks', overdueTasks: 'Overdue tasks', netAmount: 'Balance', completedCount: 'Completed tasks', totalCount: 'Total tasks', taskCount: 'Task count', taskList: 'Task list' };
const friendly = (source) => source.replace(/\{(\w+)\}/g, (match, key) => labels[key] ? `‹${labels[key]}›` : match);
const internal = (source) => Object.entries(labels).reduce((text, [key, label]) => text.replaceAll(`‹${label}›`, `{${key}}`), source);
const contentOf = (item) => ({ enabled: item.enabled, variants: structuredClone(item.variants), buttons: structuredClone(item.buttons || []), imageId: item.imageId || null });
const timingOf = (item) => Object.fromEntries((item.timingFields || []).map((field) => [field.field, structuredClone(field.value)]));

function MessageField({ label, value, onChange, variables, language, heading = false, disabled }) {
  const ref = useRef(null);
  const display = friendly(value);
  const props = { ref, className: `field ${heading ? '' : 'min-h-32'}`, 'aria-label': label, dir: language === 'ar' ? 'rtl' : 'auto', value: display, disabled, onChange: (event) => onChange(internal(event.target.value)) };
  function insert(variable) {
    const start = ref.current.selectionStart ?? display.length;
    const end = ref.current.selectionEnd ?? start;
    const token = `‹${labels[variable] || variable}›`;
    onChange(internal(display.slice(0, start) + token + display.slice(end)));
    ref.current.focus();
  }
  return <div><label className="label">{label}</label>{heading ? <input {...props} /> : <textarea {...props} />}<details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Insert details</summary><div className="mt-2 flex flex-wrap gap-2">{variables.map((variable) => <button type="button" disabled={disabled} key={variable} className="rounded-md border border-border px-2 py-1 text-primary" onClick={() => insert(variable)}>{labels[variable] || 'Details'}</button>)}</div></details></div>;
}

function Timing({ fields, value, onChange, disabled }) {
  return fields.length ? <div className="space-y-2">{fields.map((field) => <div key={field.field}><label className="label">{field.label}</label>{['times', 'offsets'].includes(field.type) ? <div className="flex flex-wrap items-center gap-2">{value[field.field].map((entry, index) => <div className="flex items-center gap-1" key={index}><input className="field w-32" aria-label={`${field.label} ${index + 1}`} disabled={disabled} type={field.type === 'times' ? 'time' : 'number'} min={field.type === 'offsets' ? 0.25 : undefined} max={field.type === 'offsets' ? 720 : undefined} step={field.type === 'offsets' ? 0.25 : undefined} value={field.type === 'offsets' ? entry / 60 : entry} onChange={(event) => onChange(field.field, value[field.field].map((item, inner) => inner === index ? field.type === 'offsets' ? Number(event.target.value) * 60 : event.target.value : item))} /><button type="button" aria-label={`Remove ${field.label} ${index + 1}`} disabled={disabled || value[field.field].length <= 1} className="icon-btn" onClick={() => onChange(field.field, value[field.field].filter((_, inner) => inner !== index))}>×</button></div>)}<button type="button" disabled={disabled || value[field.field].length >= (field.type === 'times' ? 12 : 10)} className="text-sm text-primary underline" onClick={() => onChange(field.field, [...value[field.field], field.type === 'times' ? '12:00' : 60])}>Add time</button></div> : <input className="field max-w-xs" aria-label={field.label} disabled={disabled} type={field.type} min={field.min} max={field.max} value={value[field.field]} onChange={(event) => onChange(field.field, field.type === 'number' ? Number(event.target.value) : event.target.value)} />}</div>)}</div> : <p className="text-xs text-muted">{value.userSchedule ? 'Each user chooses their own reminder times.' : 'Sent according to the existing reminder rules and user preferences.'}</p>;
}

export default function AutoMessages() {
  const { admin } = useAdminAuth();
  const canEdit = admin?.role === 'SUPER_ADMIN';
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [timing, setTiming] = useState({});
  const [language, setLanguage] = useState('en');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try { const response = await api.get('/admin/automatic-messages'); setList(response.data); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    if (!selected || !draft) return undefined;
    let active = true;
    setPreview(null); setPreviewError('');
    const timer = setTimeout(() => {
      api.post(`/admin/automatic-messages/${selected.key}/preview`, { language, content: draft })
        .then((response) => { if (active) setPreview(response.data); })
        .catch((failure) => { if (active) setPreviewError(errorMessage(failure)); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [selected, draft, language]);
  function edit(item) {
    if (selected?.key === item.key) { setSelected(null); setDraft(null); return; }
    setSelected(item); setDraft(contentOf(item)); setTiming(timingOf(item)); setLanguage('en'); setError(''); setNotice('');
  }
  async function toggle(item, enabled) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.put(`/admin/automatic-messages/${item.key}`, { ...contentOf(item), enabled });
      if (selected?.key === item.key) setDraft((current) => ({ ...current, enabled }));
      await reload(); setNotice(`${stages[item.key]?.[0] || item.name} ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.put(`/admin/automatic-messages/${selected.key}`, { ...draft, ...(selected.timingFields?.length ? { timing } : {}) });
      setDraft(contentOf(response.data)); await reload(); setNotice('Changes saved.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  const categorized = new Set(groups.flatMap(([, categories]) => categories));
  const displayGroups = [...groups, ...(list.some((item) => !categorized.has(item.category)) ? [['Other Messages', [...new Set(list.filter((item) => !categorized.has(item.category)).map((item) => item.category))]]] : [])];
  return <div className="space-y-5">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {loading ? <Spinner /> : displayGroups.map(([name, categories]) => {
      const rows = list.filter((item) => categories.includes(item.category));
      return rows.length > 0 && <section key={name}><h2 className="mb-2 text-sm font-semibold text-muted">{name}</h2><div className="panel divide-y divide-border">{rows.map((item) => {
        const active = selected?.key === item.key;
        const [title, description] = stages[item.key] || [item.name, 'Automatic Orbit notification.'];
        return <div key={item.key}>
          <div className="flex items-center gap-3 p-4"><button type="button" className="min-w-0 flex-1 text-start" aria-expanded={active} aria-controls={`auto-editor-${item.key}`} disabled={busy} onClick={() => edit(item)}><strong className="block text-sm">{title}</strong><span className="block text-xs text-muted">{description}</span></button><input type="checkbox" role="switch" aria-label={`Enable ${title}`} checked={item.enabled} disabled={!canEdit || busy} onChange={(event) => toggle(item, event.target.checked)} /><button type="button" className="text-sm text-primary" disabled={busy} onClick={() => edit(item)}>{active ? 'Close' : 'Edit'}</button></div>
          {active && draft && <form id={`auto-editor-${item.key}`} aria-label={`Edit ${title}`} className="space-y-4 border-t border-border px-4 py-4 sm:px-6" onSubmit={save}>
            <div className="flex gap-2" role="group" aria-label="Message language">{[['en', 'English'], ['ar', 'Arabic']].map(([code, text]) => <button key={code} type="button" className={`rounded-lg px-3 py-1.5 text-sm ${language === code ? 'bg-selected text-primary' : 'text-muted'}`} aria-pressed={language === code} onClick={() => setLanguage(code)}>{text}</button>)}</div>
            <fieldset disabled={busy || !canEdit} className="min-w-0 space-y-3"><MessageField label="Heading" heading language={language} disabled={!canEdit || busy} variables={item.variables || []} value={draft.variants[language].title} onChange={(value) => setDraft((current) => ({ ...current, variants: { ...current.variants, [language]: { ...current.variants[language], title: value } } }))} /><MessageField label="Message text" language={language} disabled={!canEdit || busy} variables={item.variables || []} value={draft.variants[language].body} onChange={(value) => setDraft((current) => ({ ...current, variants: { ...current.variants, [language]: { ...current.variants[language], body: value } } }))} /><Timing fields={item.timingFields || []} value={{ ...timing, userSchedule: item.timing?.startsWith('user.') }} disabled={!canEdit || busy} onChange={(field, value) => setTiming((current) => ({ ...current, [field]: value }))} />{item.timingFields?.some((field) => ['time', 'times'].includes(field.type)) && <p className="text-xs text-muted">{item.timingTimezone || 'Times follow the existing timezone settings.'}</p>}</fieldset>
            <div className="rounded-xl bg-surface-alt p-4 text-sm" aria-live="polite"><p className="mb-2 text-xs font-semibold text-muted">Sample preview</p>{previewError ? <p role="alert" className="text-red-700">{previewError}</p> : preview ? <div dir={language === 'ar' ? 'rtl' : 'auto'}>{preview.imageId && <img className="mb-3 max-h-40 max-w-full rounded-lg object-contain" alt="Automatic message attachment" src={`/api/admin/broadcasts/media/${preview.imageId}`} />}<strong dangerouslySetInnerHTML={{ __html: preview.title }} /><p className="mt-1 whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: preview.message }} />{preview.buttons?.map((row, index) => <div className="mt-2 flex flex-wrap gap-2" key={index}>{row.map((button, inner) => <span className="rounded-md border border-border px-2 py-1" key={inner}>{button.text}</span>)}</div>)}</div> : <p className="text-muted">Updating preview…</p>}</div>
            {canEdit && <button className="btn-primary" disabled={busy || !preview || Boolean(previewError)}>{busy ? 'Saving…' : 'Save Changes'}</button>}
          </form>}
        </div>;
      })}</div></section>;
    })}
    {!loading && !list.length && !error && <p className="text-sm text-muted">No automatic messages available.</p>}
  </div>;
}
