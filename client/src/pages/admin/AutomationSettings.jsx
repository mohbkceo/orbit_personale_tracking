import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';

const groups = [
  ['general', 'General automation', ['enabled', 'workerEnabled', 'timezoneBehavior', 'activeStart', 'activeEnd', 'quietEnabled', 'quietStart', 'quietEnd']],
  ['dailyFocus', 'Daily Focus', ['enabled', 'maxTasks', 'morningEnabled', 'morningTime', 'planningReminderEnabled', 'planningReminderIntervalMinutes', 'maxPlanningReminders', 'taskReminderEnabled', 'taskReminderTime', 'taskReminderIntervalMinutes', 'maxTaskReminders', 'eveningEnabled', 'eveningTime']],
  ['taskExecution', 'Task execution', ['nextActionPromptsEnabled', 'nextActionMinimumDays', 'startFollowUpEnabled', 'startCheckInDelayMinutes', 'maxStartCheckIns']],
  ['thresholds', 'Smart reminder thresholds', ['farDays', 'mediumDays', 'nearDays', 'urgentDays', 'highPriorityLeadDays', 'urgentPriorityLeadDays', 'farIntervalDays', 'mediumIntervalDays', 'nearIntervalDays', 'urgentIntervalHours', 'overdueIntervalHours']],
  ['escalation', 'Escalation', ['maxNormalReminders', 'postponeThreshold', 'ignoreThreshold', 'forceDecisionThreshold', 'maxLevel', 'cooldownMinutes']],
  ['reminderBehavior', 'Reminder behavior', ['allowBundling', 'bundleLowPriority', 'duplicateSuppressionMinutes', 'dailyFocusPriorityBoost', 'requireAcknowledgementFrom', 'blockedTaskPolicy']],
];
const choices = { timezoneBehavior: ['user', 'utc'], requireAcknowledgementFrom: ['none', 'low', 'medium', 'high', 'urgent'], blockedTaskPolicy: ['pause', 'review'] };
const descriptions = { general: 'Choose the delivery window and whether the automation worker runs.', dailyFocus: 'Planning and review times use the selected timezone behavior.', taskExecution: 'Check-ins begin after a task is started.', thresholds: 'Days before the deadline define each band. Priority lead days move important tasks into a closer band sooner.', escalation: 'Repeated postponement and ignored cues change the prompt before asking for a task decision.', reminderBehavior: 'Control bundling, equivalent-cue spacing, and blocked tasks.' };
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
  return <><PageHeader eyebrow="Admin · Settings" title="Automation Settings" description="Set the timing and limits for Daily Focus, task execution, reminders, and escalation." />
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!value ? <Spinner /> : <form onSubmit={submit} className="space-y-5">
      {groups.map(([section, title, fields]) => <section className="panel p-5" key={section}><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-[#7b867f]">{descriptions[section]}</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((key) => { const current = value[section]?.[key]; const type = typeof current;
          return <label key={key} className="text-sm"><span className="label">{label(key)}</span>
            {type === 'boolean' ? <input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={current} onChange={(event) => change(section, key, event.target.checked)} />
              : choices[key] ? <select className="field" value={current} onChange={(event) => change(section, key, event.target.value)}>{choices[key].map((option) => <option value={option} key={option}>{label(option)}</option>)}</select>
                : <input className="field" type={type === 'number' ? 'number' : /Time$|Start$|End$/.test(key) ? 'time' : 'text'} min={type === 'number' ? 0 : undefined} value={current} onChange={(event) => change(section, key, type === 'number' ? Number(event.target.value) : event.target.value)} />}
          </label>; })}
      </div></section>)}
      <div className="flex items-center gap-4"><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save automation settings'}</button>{saved && <span className="text-sm text-emerald-700">Saved</span>}</div>
    </form>}
  </>;
}
