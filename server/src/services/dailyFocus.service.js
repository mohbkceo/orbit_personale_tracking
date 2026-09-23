import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { DailyFocus } from '../models/DailyFocus.js';
import { Task } from '../models/Task.js';
import { TaskExecutionEvent } from '../models/TaskExecutionEvent.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/query.js';
import { createTask, updateTask } from './taskService.js';
import { getSettingsDocument } from './settingsService.js';
import { getAutomationSettings, automationTimezone } from './automationSettings.service.js';
import { executeTask } from './taskExecution.service.js';

dayjs.extend(utc); dayjs.extend(timezone);

export function focusDate(now, zone) { return dayjs(now).tz(zone).format('YYYY-MM-DD'); }

export async function getDailyFocus(userId, date, { create = true } = {}) {
  const settings = await getSettingsDocument(userId);
  const rules = await getAutomationSettings();
  const zone = automationTimezone(settings, rules);
  const key = date || focusDate(new Date(), zone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new AppError('Invalid focus date', 400);
  let focus = create
    ? await DailyFocus.findOneAndUpdate({ user: userId, date: key }, { $setOnInsert: { user: userId, date: key, timezone: zone } }, { upsert: true, new: true, setDefaultsOnInsert: true })
    : await DailyFocus.findOne({ user: userId, date: key });
  if (focus) focus = await focus.populate({ path: 'items.task', match: { user: userId } });
  return focus;
}

export async function addFocusTask(userId, input, channel = 'web') {
  const rules = await getAutomationSettings();
  if (!rules.general.enabled || !rules.dailyFocus.enabled) throw new AppError('Daily Focus is disabled', 409);
  const focus = await getDailyFocus(userId, input.date);
  if (focus.items.length >= rules.dailyFocus.maxTasks) throw new AppError('Daily Focus is full', 409);
  const title = String(input.title || '').trim();
  let task = input.taskId && await Task.findOne({ _id: input.taskId, user: userId, archived: false, status: { $nin: ['completed', 'cancelled'] } });
  if (input.taskId && !task) throw new AppError('Task not found', 404);
  if (!task && !title) throw new AppError('Enter a task', 400);
  if (!task) task = await Task.findOne({ user: userId, archived: false, status: { $nin: ['completed', 'cancelled'] }, title: new RegExp(`^${escapeRegex(title)}$`, 'i') });
  if (task && focus.items.some((item) => String(item.task?._id || item.task) === String(task._id))) throw new AppError('Task is already in Daily Focus', 409);
  if (!task) task = await createTask(userId, { title, createdVia: channel });
  focus.items.push({ task: task._id, position: focus.items.length + 1, source: channel });
  if (focus.items.length >= rules.dailyFocus.maxTasks) { focus.planningCompleted = true; focus.completedAt = new Date(); }
  await focus.save();
  await Task.updateOne({ _id: task._id, user: userId, executionState: 'idle' }, { $set: { executionState: 'planned' } });
  await TaskExecutionEvent.create({ user: userId, task: task._id, focus: focus._id, type: 'daily_focus_added', channel });
  return getDailyFocus(userId, focus.date);
}

export async function finishFocusPlanning(userId, channel = 'web') {
  const focus = await getDailyFocus(userId);
  if (!focus.items.length) throw new AppError('Add at least one focus task', 400);
  if (!focus.planningCompleted) {
    focus.planningCompleted = true;
    focus.completedAt = new Date();
    await focus.save();
    await TaskExecutionEvent.create({ user: userId, focus: focus._id, type: 'daily_focus_planned', channel });
  }
  return getDailyFocus(userId, focus.date);
}

export async function removeFocusTask(userId, taskId, channel = 'web') {
  const focus = await getDailyFocus(userId);
  const before = focus.items.length;
  focus.items = focus.items.filter((item) => String(item.task?._id || item.task) !== String(taskId));
  if (focus.items.length === before) throw new AppError('Focus task not found', 404);
  focus.items.forEach((item, index) => { item.position = index + 1; });
  await focus.save();
  await TaskExecutionEvent.create({ user: userId, task: taskId, focus: focus._id, type: 'daily_focus_removed', channel });
  return getDailyFocus(userId, focus.date);
}

export async function reviewFocusTask(userId, date, taskId, decision, channel = 'web', dueDate) {
  const focus = await getDailyFocus(userId, date, { create: false });
  const item = focus?.items.find((row) => String(row.task?._id || row.task) === String(taskId));
  if (!item) throw new AppError('Focus task not found', 404);
  if (item.reviewDecision) return focus;
  if (decision === 'reschedule') {
    if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) throw new AppError('Choose a date', 400);
    await updateTask(userId, taskId, { dueDate: new Date(dueDate) });
  }
  if (decision === 'drop') await updateTask(userId, taskId, { status: 'cancelled' });
  if (decision === 'backlog') await executeTask(userId, taskId, 'backlog', { channel });
  if (decision === 'tomorrow') {
    const next = dayjs.tz(`${focus.date} 12:00`, 'YYYY-MM-DD HH:mm', focus.timezone).add(1, 'day').format('YYYY-MM-DD');
    await updateTask(userId, taskId, { dueDate: new Date(`${next}T00:00:00.000Z`) });
    const tomorrow = await getDailyFocus(userId, next);
    const rules = await getAutomationSettings();
    if (!tomorrow.items.some((row) => String(row.task?._id || row.task) === String(taskId))) {
      if (tomorrow.items.length >= rules.dailyFocus.maxTasks) throw new AppError('Tomorrow’s focus is full', 409);
      tomorrow.items.push({ task: taskId, position: tomorrow.items.length + 1, source: channel });
      await tomorrow.save();
    }
  }
  item.reviewDecision = decision;
  item.reviewedAt = new Date();
  await focus.save();
  await TaskExecutionEvent.create({ user: userId, task: taskId, focus: focus._id, type: 'evening_review_decision', channel, metadata: { decision, dueDate } });
  return getDailyFocus(userId, focus.date);
}

export function focusProgress(focus) {
  const tasks = (focus?.items || []).map((item) => item.task).filter(Boolean);
  return { total: tasks.length, completed: tasks.filter((task) => task.status === 'completed').length };
}
