import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';
import { TelegramInfrastructure } from '../../admin/settings/TelegramInfrastructure.jsx';

const groups = [
  ['general', 'General automation', ['enabled', 'workerEnabled', 'timezoneBehavior', 'activeStart', 'activeEnd', 'quietEnabled', 'quietStart', 'quietEnd']],
  ['dailyFocus', 'Daily Focus', ['enabled', 'maxTasks', 'morningEnabled', 'morningTime', 'planningReminderEnabled', 'planningReminderIntervalMinutes', 'maxPlanningReminders', 'eveningEnabled', 'eveningTime']],
  ['taskReminderDigest', 'Task Reminder Digest', ['enabled', 'times', 'maxTasks', 'includeNoDueDate']],
  ['reminderBehavior', 'Reminder behavior', ['allowBundling', 'bundleLowPriority', 'duplicateSuppressionMinutes']],
];
const choices = { timezoneBehavior: ['user', 'utc'], requireAcknowledgementFrom: ['none', 'low', 'medium', 'high', 'urgent'], blockedTaskPolicy: ['pause', 'review'] };
const descriptions = { general: 'Choose the delivery window and whether the automation worker runs.', dailyFocus: 'Planning and review times use the selected timezone behavior.', taskReminderDigest: 'Send one grouped task list at these local times.', reminderBehavior: 'Control bundling and reminder spacing.' };
const label = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());

export default function AdminAutomationSettings() {
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/admin/settings/automation').then((response) => setValue(response.data)).catch((failure) => setError(failure.message)); }, []);
  function change(section, key, next) { setValue((current) => ({ ...current, [section]: { ...current[section], [key]: next } })); setSaved(false); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const response = await api.put('/admin/settings/automation', value); setValue(response.data); setSaved(true); }
    catch (failure) { const details = Object.entries(failure.errors || {}).flatMap(([field, messages]) => (messages || []).map((message) => `${label(field)}: ${message}`)); setError(details.length ? details.join(' · ') : failure.message); }
    finally { setBusy(false); }
  }
  return <><PageHeader title="Automation" description="Set the timing and limits for Daily Focus and reminders." />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!value ? <Spinner /> : <form onSubmit={submit} className="space-y-5">
      {groups.map(([section, title, fields]) => <section className="panel p-5" key={section}><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-muted">{descriptions[section]}</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map((key) => { const current = value[section]?.[key]; const type = typeof current;
          return <label key={key} className="text-sm"><span className="label">{label(key)}</span>
            {type === 'boolean' ? <input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={current} onChange={(event) => change(section, key, event.target.checked)} />
              : Array.isArray(current) ? <input className="field" value={current.join(', ')} onChange={(event) => change(section, key, event.target.value.split(',').map((time) => time.trim()))} placeholder="09:00, 14:00, 19:00" />
              : choices[key] ? <select className="field" value={current} onChange={(event) => change(section, key, event.target.value)}>{choices[key].map((option) => <option value={option} key={option}>{label(option)}</option>)}</select>
                : <input className="field" type={type === 'number' ? 'number' : /Time$|Start$|End$/.test(key) ? 'time' : 'text'} min={type === 'number' ? 0 : undefined} value={current} onChange={(event) => change(section, key, type === 'number' ? Number(event.target.value) : event.target.value)} />}
          </label>; })}
      </div>{section === 'taskReminderDigest' && <div className="mt-4 grid gap-3 sm:grid-cols-4">{['urgent', 'high', 'medium', 'low'].map((priority) => <label key={priority} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.taskReminderDigest.priorities[priority]} onChange={(event) => { setValue((current) => ({ ...current, taskReminderDigest: { ...current.taskReminderDigest, priorities: { ...current.taskReminderDigest.priorities, [priority]: event.target.checked } } })); setSaved(false); }} /> Include {priority}</label>)}</div>}</section>)}
      <div className="flex flex-wrap items-center gap-4"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save automation settings'}</button>{saved && <span role="status" className="text-sm text-emerald-700">Saved</span>}</div>
    </form>}
    <TelegramInfrastructure />
  </>;
}
