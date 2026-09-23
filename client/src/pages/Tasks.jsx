import { useEffect, useMemo, useState } from 'react';
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

const views = ['all', 'today', 'upcoming', 'overdue', 'completed'];
const priorityTone = { low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };

function TaskForm({ open, onClose, onSaved, task }) {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState([]);
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
    nextAction: task?.nextAction || '',
    estimatedMinutes: task?.estimatedMinutes || '',
  }));
  useEffect(() => {
    if (task?._id)
      endpoints
        .list('reminders', { entityType: 'task', entityId: task._id, limit: 100 })
        .then((response) =>
          setPlanned(
            response.data.filter((item) =>
              ['scheduled', 'active', 'snoozed', 'waiting'].includes(item.status),
            ),
          ),
        )
        .catch((error) => toast(error.message, 'error'));
  }, [task?._id, toast]);
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
          ? 'Task updated'
          : form.reminderMode === 'automatic'
            ? 'Task added · Smart reminders enabled'
            : 'Task added',
      );
      onSaved();
      onClose();
      if (form.reminderMode === 'custom' && !task)
        navigate(`/reminders?entityType=task&entityId=${result.data._id}`);
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
      title={task ? 'Edit task' : 'New task'}
      description="Give the work a clear next action"
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">Title</span>
          <input
            autoFocus
            required
            className="field"
            value={form.title}
            onChange={set('title')}
            placeholder="What needs doing?"
          />
        </label>
        <label>
          <span className="label">Description</span>
          <textarea
            rows="3"
            className="field h-auto py-3"
            value={form.description}
            onChange={set('description')}
            placeholder="Context, links or notes"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label><span className="label">Next action</span><input className="field" value={form.nextAction} onChange={set('nextAction')} placeholder="One concrete step" maxLength={500} /></label><label><span className="label">Estimate (min)</span><input className="field" type="number" min="1" max="10080" value={form.estimatedMinutes} onChange={set('estimatedMinutes')} /></label></div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Due date</span>
            <input type="date" className="field" value={form.dueDate} onChange={set('dueDate')} />
          </label>
          <label>
            <span className="label">Exact time</span>
            <input type="time" className="field" value={form.dueTime} onChange={set('dueTime')} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Category</span>
            <input className="field" value={form.category} onChange={set('category')} />
          </label>
          <label>
            <span className="label">Priority</span>
            <select className="field capitalize" value={form.priority} onChange={set('priority')}>
              <option>low</option>
              <option>medium</option>
              <option>high</option>
              <option>urgent</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3"><label><span className="label">Status</span><select className="field" value={form.status} onChange={set('status')}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label><span className="label">Repeat</span><select className="field" value={form.repeat} onChange={set('repeat')}><option value="never">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div>
        <div className="rounded-xl border border-[#dfe4de] p-3 dark:border-white/10">
          <label>
            <span className="label">Reminders</span>
            <select className="field" value={form.reminderMode} onChange={set('reminderMode')}>
              <option value="automatic">Automatic</option>
              <option value="custom">Custom</option>
              <option value="off">Off</option>
            </select>
          </label>
          <p className="mt-2 text-xs text-[#7b867f]">
            {form.reminderMode === 'automatic'
              ? `Smart reminders · ${task ? planned.length : form.dueDate ? form.dueTime && ['high', 'urgent'].includes(form.priority) ? 3 : 2 : 0}`
              : form.reminderMode === 'custom'
                ? 'Add your own cues after saving.'
                : 'No automatic reminders.'}
          </p>
          {task && (
            <Link
              className="mt-2 inline-block text-xs font-bold text-accent"
              to={`/reminders?entityType=task&entityId=${task._id}`}
            >
              Edit reminder plan
            </Link>
          )}
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save task'}
        </button>
      </form>
    </Modal>
  );
}

export default function Tasks() {
  const { toast } = useApp();
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
      toast(status === 'completed' ? 'Task completed' : 'Task reopened');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  async function execute(task, action) {
    try { await endpoints.create(`tasks/${task._id}/execute`, { action }); toast(action === 'start' ? 'Task started' : 'Task marked blocked'); reload(); }
    catch (err) { toast(err.message, 'error'); }
  }
  async function remove(task) {
    if (!window.confirm(`Archive “${task.title}”?`)) return;
    try {
      await endpoints.remove('tasks', task._id);
      toast('Task archived');
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
        eyebrow="Focus"
        title="Tasks"
        description="A calm list of what matters now — sorted by urgency, not noise."
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={17} />
            New task
          </button>
        }
      />
      <DailyFocusPanel onTaskChanged={reload} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#dfe4de] bg-white p-1 dark:border-white/10 dark:bg-white/5">
          {views.map((item) => (
            <button
              key={item}
              onClick={() => setView(item)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize text-[#768179]',
                view === item && 'bg-ink text-white shadow-sm dark:bg-lime dark:text-ink',
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3.5 top-3 text-[#88928c]" size={17} />
          <input
            className="field pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks"
          />
        </div>
      </div>
      <section className="panel overflow-hidden">
        <div className="hidden grid-cols-[1fr_130px_130px_100px_50px] border-b border-[#e8ece7] bg-[#fafbf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#869089] dark:border-white/5 dark:bg-white/[.02] md:grid">
          <span>Task</span>
          <span>Due</span>
          <span>Priority</span>
          <span>Status</span>
          <span />
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <EmptyState
            icon={ListFilter}
            title="Could not load tasks"
            description={error}
            action={
              <button className="btn-primary" onClick={reload}>
                Try again
              </button>
            }
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={CalendarCheck2}
            title="Nothing here"
            description={
              view === 'completed'
                ? 'Completed tasks will collect here.'
                : 'A clear list is a good list. Add your next action.'
            }
            action={
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                Add a task
              </button>
            }
          />
        ) : (
          <div>
            {tasks.map((task) => {
              const complete = task.status === 'completed';
              const overdue =
                !complete && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
              return (
                <article
                  key={task._id}
                  className="group grid gap-3 border-b border-[#edf0ec] px-4 py-4 last:border-0 hover:bg-[#fbfcfa] dark:border-white/5 dark:hover:bg-white/[.02] md:grid-cols-[1fr_130px_130px_100px_50px] md:items-center md:px-5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      onClick={() => setStatus(task, complete ? 'todo' : 'completed')}
                      className={cn(
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        complete
                          ? 'border-accent bg-accent text-white'
                          : 'border-[#b9c2bc] hover:border-accent',
                      )}
                      aria-label={complete ? 'Reopen task' : 'Complete task'}
                    >
                      {complete ? <Check size={13} /> : <Circle size={10} className="opacity-0" />}
                    </button>
                    <button onClick={() => openEdit(task)} className="min-w-0 text-left">
                      <p
                        className={cn(
                          'truncate text-sm font-semibold',
                          complete && 'text-[#8b948e] line-through',
                        )}
                      >
                        {task.title}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[#89928c]">
                        {task.category}
                        {task.description ? ` · ${task.description}` : ''}
                      </p>
                      {task.nextAction && <p className="mt-1 truncate text-[11px] text-[#6c7b71]">Next: {task.nextAction}</p>}
                    </button>
                    {!complete && task.status !== 'cancelled' && <div className="flex shrink-0 gap-2 text-[11px]"><button className="text-accent underline" onClick={() => execute(task, 'start')}>Start</button><button className="text-[#7b867f] underline" onClick={() => execute(task, 'blocked')}>Blocked</button></div>}
                  </div>
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      overdue ? 'font-bold text-red-600' : 'text-[#707c74]',
                    )}
                  >
                    <Clock3 size={14} />
                    {formatDate(task.dueDate)}
                  </div>
                  <div>
                    <StatusBadge tone={priorityTone[task.priority]}>{task.priority}</StatusBadge>
                  </div>
                  <div>
                    <StatusBadge
                      tone={
                        complete ? 'success' : task.status === 'in_progress' ? 'info' : 'neutral'
                      }
                    >
                      {task.status}
                    </StatusBadge>
                  </div>
                  <button
                    onClick={() => remove(task)}
                    className="icon-btn opacity-50 group-hover:opacity-100"
                    aria-label="Archive task"
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
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
