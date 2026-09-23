import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Personal.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pagination } from '../utils/query.js';
import { recordActivity } from './activityService.js';
import { cancelEntityReminders, regenerateAutomaticReminderPlan, resolveEntityReminders } from './reminders/reminderService.js';
import { getSettingsDocument } from './settingsService.js';
import { localDateTime, nextOccurrence } from './reminders/reminderTime.js';

dayjs.extend(utc); dayjs.extend(timezone);

export async function materializeNextTaskOccurrence(userId, task) {
  if (!task.recurring || !task.recurringRule?.frequency || !task.dueDate || task.nextOccurrenceId || task.recurrenceEnded) return null;
  const settings = await getSettingsDocument(userId);
  let next = nextOccurrence(localDateTime(task.dueDate, task.dueTime || '09:00', settings.timezone), task.recurringRule, settings.timezone);
  // If the server was offline, create only the next relevant occurrence, not a backlog.
  for (let step = 0; step < 1000 && next && dayjs(next).tz(settings.timezone).isBefore(dayjs().tz(settings.timezone), 'day'); step += 1) next = nextOccurrence(next, task.recurringRule, settings.timezone);
  if (!next) {
    task.recurrenceEnded = true;
    await task.save();
    return null;
  }
  const day = dayjs(next).tz(settings.timezone).format('YYYY-MM-DD');
  const seriesId = task.seriesId || task._id;
  let following;
  try {
    const projectId = task.projectId && await Project.exists({ _id: task.projectId, user: userId }) ? task.projectId : null;
    following = await createTask(userId, { title: task.title, description: task.description, nextAction: task.nextAction, estimatedMinutes: task.estimatedMinutes, status: 'todo', priority: task.priority, dueDate: new Date(`${day}T00:00:00.000Z`), dueTime: task.dueTime, category: task.category, projectId, recurring: true, recurringRule: task.recurringRule.toObject(), tags: task.tags, reminderMode: task.reminderMode, seriesId, occurrenceKey: day, createdVia: 'system' });
  } catch (error) {
    if (error.code !== 11000) throw error;
    following = await Task.findOne({ user: userId, seriesId, occurrenceKey: day });
  }
  task.nextOccurrenceId = following._id;
  await task.save();
  return following;
}

export async function createTask(userId, input) {
  if (input.projectId && !(await Project.exists({ _id: input.projectId, user: userId }))) throw new AppError('Project not found', 404);
  const settings = await getSettingsDocument(userId);
  const task = await Task.create({ ...input, user: userId, reminderMode: input.reminderMode || settings.reminders?.defaultEntityModes?.task || 'automatic' });
  await recordActivity(userId, { action: 'created', entityType: 'Task', entityId: task._id, description: task.title, newData: task.toObject(), source: input.createdVia });
  await regenerateAutomaticReminderPlan(userId, 'task', task._id);
  return task;
}

export async function listTasks(userId, query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { user: userId, archived: false };
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();
  if (query.view === 'today') filter.dueDate = { $gte: todayStart, $lte: todayEnd };
  if (query.view === 'upcoming') filter.dueDate = { $gt: todayEnd };
  if (query.view === 'overdue') { filter.dueDate = { $lt: todayStart }; filter.status = { $nin: ['completed', 'cancelled'] }; }
  if (query.view === 'completed') filter.status = 'completed';
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.search) filter.title = new RegExp(escapeRegex(query.search), 'i');
  const [data, total] = await Promise.all([
    Task.find(filter).populate({ path: 'projectId', match: { user: userId } }).sort({ status: 1, dueDate: 1, createdAt: -1 }).skip(skip).limit(limit),
    Task.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function updateTask(userId, id, input) {
  const current = await Task.findOne({ _id: id, user: userId });
  if (!current) throw new AppError('Task not found', 404);
  if (input.projectId && !(await Project.exists({ _id: input.projectId, user: userId }))) throw new AppError('Project not found', 404);
  const previousStatus = current.status;
  Object.assign(current, input);
  if (['dueDate', 'dueTime', 'recurring', 'recurringRule'].some((key) => key in input)) current.recurrenceEnded = false;
  if (input.status === 'completed' && previousStatus !== 'completed') current.completedAt = new Date();
  if (input.status && input.status !== 'completed') current.completedAt = null;
  if (input.status === 'completed') current.executionState = 'completed';
  if (input.status === 'cancelled') current.executionState = 'cancelled';
  if (input.status === 'todo' && ['completed', 'cancelled'].includes(previousStatus)) current.executionState = 'idle';
  await current.save();
  await recordActivity(userId, { action: input.status === 'completed' ? 'completed' : 'updated', entityType: 'Task', entityId: current._id, description: current.title, previousData: { status: previousStatus }, newData: input });
  if (current.status === 'completed') {
    await resolveEntityReminders(userId, 'task', current._id);
    if (previousStatus !== 'completed') await materializeNextTaskOccurrence(userId, current);
  }
  else if (current.status === 'cancelled') await cancelEntityReminders(userId, 'task', current._id);
  else if (['dueDate', 'dueTime', 'priority', 'status', 'recurring', 'recurringRule', 'reminderMode', 'nextAction'].some((key) => key in input)) {
    await regenerateAutomaticReminderPlan(userId, 'task', current._id);
  }
  return current;
}

export async function archiveTask(userId, id) {
  const task = await Task.findOneAndUpdate({ _id: id, user: userId }, { archived: true }, { new: true });
  if (!task) throw new AppError('Task not found', 404);
  await recordActivity(userId, { action: 'archived', entityType: 'Task', entityId: task._id, description: task.title });
  await cancelEntityReminders(userId, 'task', task._id);
  return task;
}
