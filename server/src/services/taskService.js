import dayjs from 'dayjs';
import { Task } from '../models/Task.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pagination } from '../utils/query.js';
import { recordActivity } from './activityService.js';

export async function createTask(input) {
  const task = await Task.create(input);
  await recordActivity({ action: 'created', entityType: 'Task', entityId: task._id, description: task.title, newData: task.toObject(), source: input.createdVia });
  return task;
}

export async function listTasks(query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { archived: false };
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
    Task.find(filter).populate('projectId').sort({ status: 1, dueDate: 1, createdAt: -1 }).skip(skip).limit(limit),
    Task.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function updateTask(id, input) {
  const current = await Task.findById(id);
  if (!current) throw new AppError('Task not found', 404);
  const previousStatus = current.status;
  Object.assign(current, input);
  if (input.status === 'completed' && previousStatus !== 'completed') current.completedAt = new Date();
  if (input.status && input.status !== 'completed') current.completedAt = null;
  await current.save();
  await recordActivity({ action: input.status === 'completed' ? 'completed' : 'updated', entityType: 'Task', entityId: current._id, description: current.title, previousData: { status: previousStatus }, newData: input });
  return current;
}

export async function archiveTask(id) {
  const task = await Task.findByIdAndUpdate(id, { archived: true }, { new: true });
  if (!task) throw new AppError('Task not found', 404);
  await recordActivity({ action: 'archived', entityType: 'Task', entityId: task._id, description: task.title });
  return task;
}
