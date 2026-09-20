import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { Bell, Plus } from 'lucide-react';
import { api, endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
const filters = ['All', 'Active', 'Upcoming', 'Snoozed', 'Waiting', 'Recurring', 'Completed'];
const links = {
  task: '/tasks',
  debt: '/money/debts',
  bill: '/planning/bills',
  subscription: '/planning/subscriptions',
  goal: '/planning/goals',
};
const resources = {
  task: 'tasks',
  debt: 'debts',
  bill: 'bills',
  subscription: 'subscriptions',
  goal: 'goals',
};

function ReminderForm({ onClose, onSaved, reminder, settings, initialLink }) {
  const { toast } = useApp();
  const zone = settings.timezone || 'Africa/Algiers';
  const local = reminder ? dayjs(reminder.nextTriggerAt).tz(zone) : dayjs().tz(zone).add(1, 'hour');
  const [form, setForm] = useState({
    title: reminder?.title || '',
    message: reminder?.message || '',
    date: local.format('YYYY-MM-DD'),
    time: local.format('HH:mm'),
    repeat: reminder?.trigger?.recurrence?.frequency || 'never',
    recurrenceInterval: reminder?.trigger?.recurrence?.interval || 1,
    recurrenceDaysOfWeek: reminder?.trigger?.recurrence?.daysOfWeek || [],
    recurrenceDayOfMonth: reminder?.trigger?.recurrence?.dayOfMonth || local.date(),
    recurrenceEndDate: reminder?.trigger?.recurrence?.endDate
      ? dayjs(reminder.trigger.recurrence.endDate).tz(zone).format('YYYY-MM-DD')
      : '',
    priority: reminder?.priority || 'medium',
    entityType: reminder?.entityType || initialLink?.entityType || 'custom',
    entityId: reminder?.entityId || initialLink?.entityId || '',
    requireAcknowledgement: reminder?.requireAcknowledgement || false,
    followUpEnabled: reminder?.followUp?.enabled || false,
    followUpDelay: reminder?.followUp?.delayMinutes || 1440,
    followUpMax: reminder?.followUp?.maxCount || 1,
    deliveryChannels: reminder?.deliveryChannels || ['telegram', 'web'],
  });
  const [entities, setEntities] = useState([]);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (form.entityType !== 'custom')
      endpoints
        .list(resources[form.entityType], { limit: 100 })
        .then((result) => setEntities(result.data || []))
        .catch((error) => toast(error.message, 'error'));
  }, [form.entityType, toast]);
  const set = (key) => (event) =>
    setForm((value) => ({
      ...value,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const localWhen = dayjs.tz(`${form.date} ${form.time}`, 'YYYY-MM-DD HH:mm', zone);
      if (localWhen.format('YYYY-MM-DD HH:mm') !== `${form.date} ${form.time}`)
        throw new Error('That local date or time does not exist');
      const when = localWhen.toDate();
      const payload = {
        title: form.title,
        message: form.message,
        entityType: form.entityType,
        entityId: form.entityType === 'custom' ? null : form.entityId,
        priority: form.priority,
        requireAcknowledgement: form.requireAcknowledgement,
        followUp: {
          enabled: form.repeat === 'never' && form.followUpEnabled,
          delayMinutes: Number(form.followUpDelay),
          maxCount: Number(form.followUpMax),
        },
        deliveryChannels: form.deliveryChannels,
        trigger: {
          type: form.repeat === 'never' ? 'datetime' : 'recurring',
          at: when,
          timezone: zone,
          ...(form.repeat === 'never'
            ? {}
            : {
                recurrence: {
                  frequency: form.repeat,
                  interval: Number(form.recurrenceInterval),
                  startDate: when,
                  ...(form.repeat === 'weekly' && form.recurrenceDaysOfWeek.length
                    ? { daysOfWeek: form.recurrenceDaysOfWeek }
                    : {}),
                  ...(form.repeat === 'monthly'
                    ? { dayOfMonth: Number(form.recurrenceDayOfMonth) }
                    : {}),
                  ...(form.recurrenceEndDate
                    ? {
                        endDate: dayjs
                          .tz(`${form.recurrenceEndDate} 23:59`, 'YYYY-MM-DD HH:mm', zone)
                          .toDate(),
                      }
                    : {}),
                },
              }),
        },
        nextTriggerAt: when,
      };
      if (reminder) await endpoints.update('reminders', reminder._id, payload);
      else await endpoints.create('reminders', payload);
      toast(reminder ? 'Reminder updated' : 'Reminder created');
      onSaved();
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={reminder ? 'Edit reminder' : 'New reminder'}
      description="A cue for the right moment"
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">What should I remind you about?</span>
          <input
            required
            autoFocus
            maxLength={180}
            className="field"
            value={form.title}
            onChange={set('title')}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Date</span>
            <input
              required
              type="date"
              className="field"
              value={form.date}
              onChange={set('date')}
            />
          </label>
          <label>
            <span className="label">Time · {zone}</span>
            <input
              required
              type="time"
              className="field"
              value={form.time}
              onChange={set('time')}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Repeat</span>
            <select className="field" value={form.repeat} onChange={set('repeat')}>
              {['never', 'daily', 'weekly', 'monthly', 'yearly'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Linked to</span>
            <select
              className="field"
              value={form.entityType}
              onChange={(event) =>
                setForm((value) => ({ ...value, entityType: event.target.value, entityId: '' }))
              }
            >
              <option value="custom">Nothing</option>
              {Object.keys(resources).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        {form.entityType !== 'custom' && (
          <label>
            <span className="label">Item</span>
            <select required className="field" value={form.entityId} onChange={set('entityId')}>
              <option value="">Choose item</option>
              {entities.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title || item.name || item.personName}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="text-xs font-semibold text-accent"
          onClick={() => setAdvanced(!advanced)}
        >
          {advanced ? 'Hide' : 'Show'} advanced settings
        </button>
        {advanced && (
          <div className="space-y-3 rounded-xl border border-[#e1e6e0] p-4 dark:border-white/10">
            <label>
              <span className="label">Context</span>
              <textarea
                className="field h-auto py-2"
                rows="2"
                value={form.message}
                onChange={set('message')}
              />
            </label>
            <label>
              <span className="label">Priority</span>
              <select className="field" value={form.priority} onChange={set('priority')}>
                {['low', 'medium', 'high', 'urgent'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {form.repeat !== 'never' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <label>
                    <span className="label">Repeat every</span>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max="365"
                      value={form.recurrenceInterval}
                      onChange={set('recurrenceInterval')}
                    />
                  </label>
                  <label>
                    <span className="label">Last date · optional</span>
                    <input
                      className="field"
                      type="date"
                      value={form.recurrenceEndDate}
                      onChange={set('recurrenceEndDate')}
                    />
                  </label>
                </div>
                {form.repeat === 'weekly' && (
                  <div>
                    <span className="label">Days of week</span>
                    <div className="flex flex-wrap gap-2">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                        <label key={day} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={form.recurrenceDaysOfWeek.includes(index)}
                            onChange={(event) =>
                              setForm((value) => ({
                                ...value,
                                recurrenceDaysOfWeek: event.target.checked
                                  ? [...value.recurrenceDaysOfWeek, index]
                                  : value.recurrenceDaysOfWeek.filter((entry) => entry !== index),
                              }))
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {form.repeat === 'monthly' && (
                  <label>
                    <span className="label">Day of month</span>
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max="31"
                      value={form.recurrenceDayOfMonth}
                      onChange={set('recurrenceDayOfMonth')}
                    />
                  </label>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requireAcknowledgement}
                onChange={set('requireAcknowledgement')}
              />
              Require acknowledgement
            </label>
            {form.repeat === 'never' && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.followUpEnabled}
                    onChange={set('followUpEnabled')}
                  />
                  Follow up if still open
                </label>
                {form.followUpEnabled && (
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="label">After · minutes</span>
                      <input
                        className="field"
                        type="number"
                        min="30"
                        max="10080"
                        value={form.followUpDelay}
                        onChange={set('followUpDelay')}
                      />
                    </label>
                    <label>
                      <span className="label">Maximum follow-ups</span>
                      <input
                        className="field"
                        type="number"
                        min="0"
                        max="3"
                        value={form.followUpMax}
                        onChange={set('followUpMax')}
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.deliveryChannels.includes('telegram')}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    deliveryChannels: event.target.checked ? ['telegram', 'web'] : ['web'],
                  }))
                }
              />
              Telegram delivery
            </label>
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : reminder ? 'Save reminder' : 'Create reminder'}
        </button>
      </form>
    </Modal>
  );
}

function ReminderCard({ item, onAction, onEdit, settings }) {
  const [menu, setMenu] = useState('');
  const financial = ['debt', 'bill', 'subscription'].includes(item.entityType);
  const resolved = ['completed', 'cancelled', 'expired', 'suppressed'].includes(item.status);
  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold">{item.title}</h3>
          <p className="mt-1 text-xs text-[#748078]">
            {item.message ||
              (item.purpose === 'review' ? 'Review your progress' : 'Ready to handle')}{' '}
            · {dayjs(item.nextTriggerAt).tz(settings.timezone).format('ddd, D MMM · HH:mm')}
          </p>
        </div>
        <StatusBadge
          tone={
            item.priority === 'urgent' ? 'danger' : item.priority === 'high' ? 'warning' : 'neutral'
          }
        >
          {item.status}
        </StatusBadge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#819087]">
          {item.source === 'automatic' ? 'Automatic' : 'Custom'} · {item.entityType}
        </span>
        {item.metadata?.explanation && (
          <details className="text-[#738077]">
            <summary className="cursor-pointer">Why this reminder?</summary>
            <p className="mt-1 max-w-md whitespace-pre-line">
              {item.metadata.explanation}
              {item.metadata.lastDecision ? `\n${item.metadata.lastDecision}` : ''}
            </p>
          </details>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!resolved && !financial && (
          <button className="btn-secondary h-8" onClick={() => onAction(item, 'complete')}>
            {item.entityType === 'goal' ? 'Reviewed' : 'Done'}
          </button>
        )}
        {!resolved && financial && (
          <Link className="btn-secondary h-8" to={links[item.entityType]}>
            Open item
          </Link>
        )}
        {!resolved && item.status === 'waiting' ? (
          <button className="btn-secondary h-8" onClick={() => onAction(item, 'resume')}>
            Resume
          </button>
        ) : (
          !resolved && (
            <>
              <button
                className="btn-secondary h-8"
                onClick={() => setMenu(menu === 'later' ? '' : 'later')}
              >
                Later
              </button>
              <button
                className="btn-secondary h-8"
                onClick={() => setMenu(menu === 'block' ? '' : 'block')}
              >
                Blocked
              </button>
            </>
          )
        )}
        <button className="btn-secondary h-8" onClick={() => onEdit(item)}>
          Edit
        </button>
        {!resolved && (
          <button className="btn-secondary h-8" onClick={() => onAction(item, 'cancel')}>
            Cancel
          </button>
        )}
      </div>
      {menu === 'later' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['30 min', 30],
            ['2 hours', 120],
            ['Tomorrow', 1440],
          ].map(([label, minutes]) => (
            <button
              key={label}
              className="btn-secondary h-8"
              onClick={() => {
                onAction(item, 'snooze', { until: dayjs().add(minutes, 'minute').toDate() });
                setMenu('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {menu === 'block' && (
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['Waiting for info', 'waiting_for_info'],
            ['Waiting for someone', 'waiting_for_someone'],
            ['Not enough time', 'not_enough_time'],
            ['Other', 'other'],
          ].map(([label, reason]) => (
            <button
              key={reason}
              className="btn-secondary h-8"
              onClick={() => {
                onAction(item, 'block', { reason });
                setMenu('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function EntityReminderControls({ entityType, entityId, count, onChanged }) {
  const { toast } = useApp();
  const [entity, setEntity] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = `/reminders/entity/${entityType}/${entityId}`;
  useEffect(() => {
    api
      .get(`${base}/mode`)
      .then((result) => setEntity(result.data))
      .catch((error) => toast(error.message, 'error'));
  }, [base, toast]);
  async function changeMode(mode) {
    setBusy(true);
    try {
      const result = await api.patch(`${base}/mode`, { mode });
      setEntity(result.data);
      await onChanged();
      toast('Reminder mode updated');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    try {
      await api.post(`${base}/regenerate`);
      await onChanged();
      toast('Automatic defaults restored');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  if (!entity) return null;
  return (
    <section className="panel mb-5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#7b867f]">
            Reminder plan · {entityType}
          </p>
          <h2 className="mt-1 font-display font-bold">{entity.title}</h2>
          <p className="mt-1 text-xs text-[#7b867f]">
            {count} open reminder{count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Reminder mode"
            disabled={busy}
            className="field w-36"
            value={entity.mode}
            onChange={(event) => changeMode(event.target.value)}
          >
            <option value="automatic">Automatic</option>
            <option value="custom">Custom</option>
            <option value="off">Off</option>
          </select>
          {entity.mode === 'automatic' && (
            <button className="btn-secondary h-10" disabled={busy} onClick={restore}>
              Restore defaults
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Reminders() {
  const { settings, toast } = useApp();
  const [params] = useSearchParams();
  const entityType = params.get('entityType');
  const entityId = params.get('entityId');
  const initialLink = entityType && entityId ? { entityType, entityId } : null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const load = useCallback(async () => {
    try {
      const result = await endpoints.list('reminders', {
        limit: 100,
        ...(entityType && entityId ? { entityType, entityId } : {}),
      });
      setItems(result.data);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, toast]);
  useEffect(() => {
    load();
  }, [load]);
  const groups = useMemo(() => {
    const now = Date.now();
    const next = {
      Now: [],
      Upcoming: [],
      Snoozed: [],
      Waiting: [],
      Recurring: [],
      'Completed / history': [],
    };
    for (const item of items) {
      if (['completed', 'cancelled', 'expired', 'suppressed'].includes(item.status))
        next['Completed / history'].push(item);
      else if (item.status === 'waiting') next.Waiting.push(item);
      else if (item.status === 'snoozed') next.Snoozed.push(item);
      else if (item.status === 'active' || new Date(item.nextTriggerAt).getTime() <= now)
        next.Now.push(item);
      else if (item.trigger?.type === 'recurring') next.Recurring.push(item);
      else next.Upcoming.push(item);
    }
    next.Now.sort(
      (a, b) =>
        ['urgent', 'high', 'medium', 'low'].indexOf(a.priority) -
        ['urgent', 'high', 'medium', 'low'].indexOf(b.priority),
    );
    return next;
  }, [items]);
  async function action(item, kind, body) {
    try {
      if (kind === 'cancel') await endpoints.remove('reminders', item._id);
      else await api.post(`/reminders/${item._id}/${kind}`, body || {});
      toast('Reminder updated');
      load();
    } catch (error) {
      toast(error.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Focus"
        title="Reminders"
        description="Your attention schedule, ready when it matters."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} />
            New reminder
          </button>
        }
      />
      {initialLink && (
        <EntityReminderControls
          key={`${entityType}:${entityId}`}
          entityType={entityType}
          entityId={entityId}
          count={
            items.filter((item) =>
              ['scheduled', 'active', 'snoozed', 'waiting'].includes(item.status),
            ).length
          }
          onChanged={load}
        />
      )}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-[#dfe4de] bg-white p-1 dark:border-white/10 dark:bg-white/5">
        {filters.map((name) => (
          <button
            key={name}
            className={`rounded-lg px-3 py-2 text-xs font-bold ${filter === name ? 'bg-ink text-white dark:bg-lime dark:text-ink' : 'text-[#768179]'}`}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No reminders yet"
          description="Create a standalone reminder, or add a dated task."
          action={
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              New reminder
            </button>
          }
        />
      ) : (
        <div className="space-y-7">
          {Object.entries(groups)
            .filter(
              ([name]) =>
                filter === 'All' ||
                name === filter ||
                (filter === 'Active' && name === 'Now') ||
                (filter === 'Completed' && name === 'Completed / history'),
            )
            .map(
              ([name, rows]) =>
                rows.length > 0 && (
                  <section key={name}>
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-[.15em] text-[#728078]">
                      {name}
                    </h2>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {rows.map((item) => (
                        <ReminderCard
                          key={item._id}
                          item={item}
                          onAction={action}
                          onEdit={(value) => {
                            setEditing(value);
                            setFormOpen(true);
                          }}
                          settings={settings}
                        />
                      ))}
                    </div>
                  </section>
                ),
            )}
        </div>
      )}
      {formOpen && (
        <ReminderForm
          key={editing?._id || 'new'}
          onClose={() => setFormOpen(false)}
          onSaved={load}
          reminder={editing}
          settings={settings}
          initialLink={initialLink}
        />
      )}
    </>
  );
}
