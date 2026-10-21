import { useTranslation } from 'react-i18next';
import { useOrbitReducedMotion } from '../animations/useOrbitReducedMotion.js';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  CalendarCheck2,
  Check,
  Circle,
  Clock3,
  ListFilter,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import dayjs from 'dayjs';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { cn, formatDate, todayInput } from '../utils/format.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { DailyFocusPanel } from '../components/DailyFocusPanel.jsx';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedList } from '../animations/AnimatedList.jsx';
import { spring, timing, taskMotion, buttonMotion } from '../animations/motionPresets.js';

const views = ['all', 'today', 'upcoming', 'overdue', 'completed'];
const priorityTone = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };

function TaskForm({ open, onClose, onSaved, task }) {
  const { t: _t } = useTranslation();
  const { toast, reward } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'medium',
    status: task?.status || 'todo',
    dueDate: task?.dueDate ? dayjs(task.dueDate).format('YYYY-MM-DD') : todayInput(),
    dueTime: task?.dueTime || '',
    category: task?.category || 'Personal',
    repeat: task?.recurringRule?.frequency || 'never',
    reminderMode: task?.reminderMode || 'automatic',
    taskReminderState: task?.reminderMode && task.reminderMode !== 'automatic' ? 'muted' : task?.taskReminderState || 'enabled',
    nextAction: task?.nextAction || '',
    estimatedMinutes: task?.estimatedMinutes || '',
  }));
  const set = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const { repeat, ...taskFields } = form;
      const payload = { ...taskFields, estimatedMinutes: taskFields.estimatedMinutes ? Number(taskFields.estimatedMinutes) : null, recurring: repeat !== 'never', ...(repeat === 'never' ? {} : { recurringRule: { frequency: repeat, interval: 1 } }) };
      const result = task
        ? await endpoints.update('tasks', task._id, payload)
        : await endpoints.create('tasks', payload);
      toast(
        task
          ? _t('tasks:messages.updated')
          : result.data.taskReminderState === 'enabled' && result.data.reminderMode === 'automatic'
            ? _t('tasks:messages.addedWithReminders')
            : _t('tasks:messages.added'),
      );
      if (!task) reward('TASK_CREATED');
      onSaved();
      onClose();
      if (form.reminderMode === 'custom' && !task)
        navigate(`/panel/reminders?entityType=task&entityId=${result.data._id}`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? _t('tasks:messages.edit') : _t('tasks:ui.newTask')}
      description={_t('tasks:ui.giveTheWorkAClearNextAction')}
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">{_t('tasks:ui.title')}</span>
          <input
            autoFocus
            required
            className="field"
            value={form.title}
            onChange={set('title')}
            placeholder={_t('tasks:ui.whatNeedsDoing')}
          />
        </label>
        <label>
          <span className="label">{_t('tasks:ui.description')}</span>
          <textarea
            rows="3"
            className="field h-auto py-3"
            value={form.description}
            onChange={set('description')}
            placeholder={_t('tasks:ui.contextLinksOrNotes')}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label><span className="label">{_t('tasks:ui.nextAction')}</span><input className="field" value={form.nextAction} onChange={set('nextAction')} placeholder={_t('tasks:ui.oneConcreteStep')} maxLength={500} /></label><label><span className="label">{_t('tasks:ui.estimateMin')}</span><input className="field" type="number" min="1" max="10080" value={form.estimatedMinutes} onChange={set('estimatedMinutes')} /></label></div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{_t('tasks:ui.dueDate')}</span>
            <input type="date" className="field" value={form.dueDate} onChange={set('dueDate')} />
          </label>
          <label>
            <span className="label">{_t('tasks:ui.exactTime')}</span>
            <input type="time" className="field" value={form.dueTime} onChange={set('dueTime')} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{_t('tasks:ui.category')}</span>
            <input className="field" value={form.category} onChange={set('category')} />
          </label>
          <label>
            <span className="label">{_t('tasks:ui.priority')}</span>
            <select className="field capitalize" value={form.priority} onChange={set('priority')}>
              <option value="low">{_t('tasks:ui.low')}</option>
              <option value="medium">{_t('tasks:ui.medium')}</option>
              <option value="high">{_t('tasks:ui.high')}</option>
              <option value="urgent">{_t('tasks:ui.urgent')}</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3"><label><span className="label">{_t('tasks:ui.status')}</span><select className="field" value={form.status} onChange={set('status')}><option value="todo">{_t('common:status.todo')}</option><option value="in_progress">{_t('common:status.in_progress')}</option><option value="completed">{_t('common:status.completed')}</option><option value="cancelled">{_t('tasks:ui.cancelled')}</option></select></label><label><span className="label">{_t('tasks:ui.repeat')}</span><select className="field" value={form.repeat} onChange={set('repeat')}><option value="never">{_t('tasks:ui.never')}</option><option value="daily">{_t('tasks:ui.daily')}</option><option value="weekly">{_t('tasks:ui.weekly')}</option><option value="monthly">{_t('tasks:ui.monthly')}</option><option value="yearly">{_t('tasks:ui.yearly')}</option></select></label></div>
        <div className="rounded-xl border border-border p-3 ">
          <label>
            <span className="label">{_t('tasks:ui.reminderMode')}</span>
            <select className="field" value={form.reminderMode} onChange={(event) => setForm((current) => ({ ...current, reminderMode: event.target.value, taskReminderState: event.target.value === 'automatic' ? 'enabled' : 'muted' }))}>
              <option value="automatic">{_t('tasks:ui.taskDigest')}</option>
              <option value="custom">{_t('tasks:ui.manualRemindersOnly')}</option>
              <option value="off">{_t('tasks:ui.off')}</option>
            </select>
          </label>
          <label className="mt-3 block"><span className="label">{_t('tasks:ui.taskReminders')}</span><select className="field" value={form.taskReminderState} disabled={form.reminderMode !== 'automatic'} onChange={set('taskReminderState')}><option value="enabled">{_t('tasks:ui.enabled')}</option><option value="muted">{_t('tasks:ui.muted')}</option></select></label>
          <p className="mt-2 text-xs text-muted">
            {form.reminderMode === 'automatic'
              ? form.taskReminderState === 'enabled' ? _t('tasks:ui.includedInScheduledTaskDigests') : _t('tasks:ui.excludedFromTaskDigests')
              : form.reminderMode === 'custom'
                ? _t('tasks:ui.addYourOwnReminderAfterSaving')
                : _t('tasks:ui.noAutomaticTaskReminders')}
          </p>
          {task && (
            <Link
              className="mt-2 inline-block text-xs font-bold text-primary"
              to={`/panel/reminders?entityType=task&entityId=${task._id}`}
            >{_t('tasks:ui.addOrEditAManualReminder')}</Link>
          )}
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? _t('common:saving') : _t('tasks:ui.saveTask')}
        </button>
      </form>
    </Modal>
  );
}

export default function Tasks() {
  const { t: _t } = useTranslation();
  const { toast, reward } = useApp();
  const reduce = useOrbitReducedMotion();
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const loader = useMemo(
    () => () =>
      endpoints.list('tasks', {
        view: view === 'all' ? undefined : view,
        search: query || undefined,
        limit: 100,
      }),
    [view, query],
  );
  const { data, loading, error, reload } = useData(loader, [loader]);
  const tasks = data?.data || [];
  async function setStatus(task, status) {
    try {
      if (status === 'completed') await endpoints.create(`tasks/${task._id}/execute`, { action: 'done' });
      else await endpoints.update('tasks', task._id, { status });
      toast(_t(status === 'completed' ? 'tasks:messages.completed' : 'tasks:messages.reopened'));
      if (status === 'completed') reward('TASK_COMPLETED');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  async function execute(task, action) {
    try { await endpoints.create(`tasks/${task._id}/execute`, { action }); toast(_t(action === 'start' ? 'tasks:messages.started' : 'tasks:messages.blocked')); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function toggleTaskReminders(task) {
    try {
      const enabled = task.reminderMode === 'automatic' && task.taskReminderState !== 'muted';
      await endpoints.update('tasks', task._id, { taskReminderState: enabled ? 'muted' : 'enabled', ...(!enabled ? { reminderMode: 'automatic' } : {}) });
      toast(_t(enabled ? 'tasks:messages.remindersMuted' : 'tasks:messages.remindersEnabled'));
      reload();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(task) {
    if (!window.confirm(_t('common:dynamic.archiveNamed', { name: task.title }))) return;
    try {
      await endpoints.remove('tasks', task._id);
      toast(_t('tasks:ui.taskArchived'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  const openEdit = (task) => {
    setEditing(task);
    setFormOpen(true);
  };
  return (
    <>
      <PageHeader
        eyebrow={_t('tasks:ui.focus')}
        title={_t('tasks:title')}
        description={_t('tasks:ui.aCalmListOfWhatMattersNowSortedByUrgencyNotNoise')}
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} />{_t('tasks:ui.newTask')}</button>
        }
      />
      <DailyFocusPanel onTaskChanged={reload} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1  ">
          {views.map((item) => (
            <button
              key={item}
              onClick={() => setView(item)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize text-muted',
                view === item && 'bg-selected text-primary',
              )}
            >
              {_t(`tasks:views.${item}`)}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="absolute start-3.5 top-3 text-muted" size={17} />
          <input
            className="field ps-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={_t('tasks:ui.searchTasks')}
          />
        </div>
      </div>
      <section className="panel overflow-hidden">
        <div className="hidden grid-cols-[1fr_130px_130px_100px_50px] border-b border-border bg-surface-alt px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted  dark:bg-surface/[.02] md:grid">
          <span>{_t('tasks:ui.task')}</span>
          <span>{_t('tasks:ui.due')}</span>
          <span>{_t('tasks:ui.priority')}</span>
          <span>{_t('tasks:ui.status')}</span>
          <span />
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <EmptyState
            icon={ListFilter}
            title={_t('tasks:ui.couldNotLoadTasks')}
            description={error}
            action={
              <button className="btn-primary" onClick={reload}>{_t('tasks:ui.tryAgain')}</button>
            }
          />
        ) : (<>{tasks.length === 0 && (
          <EmptyState
            icon={CalendarCheck2}
            title={_t('tasks:ui.nothingHere')}
            description={
              view === 'completed'
                ? _t('tasks:emptyCompleted')
                : _t('tasks:emptyCurrent')
            }
            action={
              <button className="btn-primary" onClick={() => setFormOpen(true)}>{_t('tasks:ui.addATask')}</button>
            }
          />
        )}
          <AnimatedList items={tasks} renderItem={(task) => {
              const complete = task.status === 'completed';
              const overdue =
                !complete && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
              return (
                <article
                  key={task._id}
                  className="group grid gap-3 border-b border-border px-4 py-4 last:border-0 hover:bg-hover  dark:hover:bg-surface/[.02] md:grid-cols-[1fr_130px_130px_100px_50px] md:items-center md:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <motion.button
                      whileTap={reduce ? undefined : taskMotion.checkboxTap}
                      transition={{ duration: timing.micro }}
                      onClick={() => setStatus(task, complete ? 'todo' : 'completed')}
                      className={cn(
                        'relative mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        complete
                          ? 'border-primary bg-primary text-primary-text'
                          : 'border-border hover:border-primary',
                      )}
                      aria-label={_t(complete ? 'tasks:reopenTask' : 'tasks:completeTask')}
                    >
                      <AnimatePresence>{complete && <motion.span key="check" initial={reduce ? { opacity: 0 } : taskMotion.checkInitial} animate={{ scale: 1, opacity: 1 }} exit={taskMotion.checkExit} transition={spring}><Check size={13} /></motion.span>}</AnimatePresence>
                      <AnimatePresence initial={false}>{complete && !reduce && <motion.span key="ripple" className="pointer-events-none absolute inset-0 rounded-full border border-primary" initial={taskMotion.rippleInitial} animate={taskMotion.rippleFinal} exit={{ opacity: 0 }} transition={{ duration: timing.task }} />}</AnimatePresence>
                      {!complete && <Circle size={10} className="opacity-0" />}
                    </motion.button>
                    <button onClick={() => openEdit(task)} className="min-w-0 text-start">
                      <p
                        className={cn(
                          'relative truncate text-sm font-semibold transition-colors',
                          complete && 'text-muted',
                        )}
                      >
                        <span className="relative">{task.title}{complete && <motion.span className="absolute inset-x-0 top-1/2 h-px bg-current" style={{ transformOrigin: 'left' }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: timing.task }} />}</span>
                      </p>
                      <p className="mt-1 truncate text-[11px] text-muted">
                        {task.category}
                        {task.description ? ` · ${task.description}` : ''}
                      </p>
                      {task.nextAction && <p className="mt-1 truncate text-[11px] text-muted">{_t('tasks:ui.next')}{' '}{task.nextAction}</p>}
                    </button>
                    {!complete && task.status !== 'cancelled' && <button className="shrink-0 text-[11px] text-muted underline" onClick={() => toggleTaskReminders(task)}>{_t('tasks:ui.taskReminders2')}{' '}{task.reminderMode === 'automatic' && task.taskReminderState !== 'muted' ? _t('tasks:ui.enabled') : _t('tasks:ui.muted')}</button>}
                    {!complete && task.status !== 'cancelled' && <div className="flex shrink-0 gap-2 text-[11px]"><motion.button whileTap={reduce ? undefined : buttonMotion.whileTap} transition={buttonMotion.transition} className="text-primary underline" onClick={() => execute(task, 'start')}>{_t('tasks:ui.start')}</motion.button><button className="text-muted underline" onClick={() => execute(task, 'blocked')}>{_t('common:status.blocked')}</button></div>}
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      overdue ? 'font-bold text-danger' : 'text-muted',
                    )}
                  >
                    <Clock3 size={14} />
                    {formatDate(task.dueDate)}
                  </div>
                  <div>
                    <StatusBadge tone={priorityTone[task.priority]}>{task.priority}</StatusBadge>
                  </div>
                  <div>
                    <motion.span key={task.status} initial={reduce ? { opacity: 0 } : taskMotion.startedInitial} animate={{ opacity: 1, scale: 1 }} transition={{ duration: timing.list }}><StatusBadge
                      tone={
                        complete ? 'success' : task.status === 'in_progress' ? 'info' : 'neutral'
                      }
                    >
                      {task.status}
                    </StatusBadge></motion.span>
                  </div>
                  <button
                    onClick={() => remove(task)}
                    className="icon-btn opacity-50 group-hover:opacity-100"
                    aria-label={_t('tasks:ui.archiveTask')}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            }} /></>
        )}
      </section>
      <TaskForm
        key={editing?._id || 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        task={editing}
      />
    </>
  );
}
