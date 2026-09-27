import { useState } from 'react';
import { api } from '../api/client.js';
import { useData } from '../hooks/useData.js';
import { useApp } from '../context/useApp.js';
import { AnimatedList } from '../animations/AnimatedList.jsx';

const load = () => api.get('/daily-focus/today');

export function DailyFocusPanel({ compact = false, onTaskChanged }) {
  const { toast, reward } = useApp();
  const { data, loading, error, reload } = useData(load, 'daily-focus');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const focus = data?.data;
  async function run(path, method = 'post', body) {
    setBusy(true);
    try { await api[method](path, body); const next = await reload(); onTaskChanged?.(); if (path === '/daily-focus/today/items' && body?.title) reward('TASK_CREATED'); if (body?.action === 'done' && next?.data) { const progress = next.data.progress; if (progress.total > 0 && progress.completed === progress.total && focus?.progress?.completed < progress.total) reward('DAILY_GOALS_COMPLETED', `${progress.completed} / ${progress.total}`); else reward('TASK_COMPLETED'); } }
    catch (failure) { toast(failure.message, 'error'); }
    finally { setBusy(false); }
  }
  async function add(event) { event.preventDefault(); if (!title.trim()) return; await run('/daily-focus/today/items', 'post', { title: title.trim() }); setTitle(''); }
  return <section className="panel mb-5 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow">Daily Focus</p><h2 className="mt-1 font-display text-lg font-bold">Today’s Focus</h2></div><span className="text-sm font-bold text-primary">{focus?.progress?.completed || 0} / {focus?.progress?.total || 0} complete</span></div>
    {loading ? <p className="mt-3 text-sm text-muted">Loading focus…</p> : error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : <>
      <p className="mt-2 text-xs text-muted">{focus?.enabled ? `${focus.items.length}/${focus.maxTasks} selected` : 'Daily Focus is disabled by your administrator.'}</p>
      {focus?.items?.length ? <AnimatedList className="mt-4 space-y-2" items={focus.items.filter((item) => item.task)} getKey={(item) => item.task._id} renderItem={(item) => { const task = item.task; return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-alt p-3 "><span className="w-5 text-xs font-bold text-muted">{item.position}.</span><div className="min-w-32 flex-1"><p className={task.status === 'completed' ? 'text-sm font-semibold line-through opacity-60' : 'text-sm font-semibold'}>{task.title}</p>{task.nextAction && <p className="text-xs text-muted">Next: {task.nextAction}</p>}</div><span className="text-xs text-muted">{task.executionState || task.status}</span>{task.status !== 'completed' && <><button className="btn-secondary text-xs" disabled={busy} onClick={() => run(`/tasks/${task._id}/execute`, 'post', { action: 'start' })}>Start</button><button className="btn-secondary text-xs" disabled={busy} onClick={() => run(`/tasks/${task._id}/execute`, 'post', { action: 'done' })}>Done</button><button className="btn-secondary text-xs" disabled={busy} onClick={() => run(`/tasks/${task._id}/execute`, 'post', { action: 'blocked' })}>Blocked</button></>}<button className="text-xs text-muted underline" disabled={busy} onClick={() => run(`/daily-focus/today/items/${task._id}`, 'delete')}>Remove</button></div>; }} /> : <p className="mt-4 text-sm text-muted">Choose what matters today. You can finish with fewer than the maximum.</p>}
      {focus?.enabled && <div className="mt-4 flex flex-wrap gap-2"><form onSubmit={add} className="flex min-w-48 flex-1 gap-2"><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add or replace a focus task" maxLength={180} disabled={focus.items.length >= focus.maxTasks} /><button className="btn-primary" disabled={busy || !title.trim() || focus.items.length >= focus.maxTasks}>Add</button></form>{!focus?.planningCompleted && <button className="btn-secondary" disabled={busy} onClick={() => run('/daily-focus/today/done')}>Done planning</button>}</div>}
      {focus?.planningCompleted && !compact && <p className="mt-3 text-xs text-muted">Remove a task before replacing it when your focus is full.</p>}
    </>}
  </section>;
}
