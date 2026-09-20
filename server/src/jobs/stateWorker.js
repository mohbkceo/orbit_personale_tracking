import { Bill } from '../models/Planning.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { materializeNextTaskOccurrence } from '../services/taskService.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function updateOverdueStatuses(userId) {
  const now = new Date();
  await Promise.all([
    Bill.updateMany(
      { user: userId, dueDate: { $lt: now }, status: { $in: ['upcoming', 'due'] } },
      { status: 'overdue' },
    ),
    Debt.updateMany(
      { user: userId, dueDate: { $lt: now }, status: { $in: ['unpaid', 'partial'] } },
      { status: 'overdue' },
    ),
  ]);
  const settings = await getSettingsDocument(userId);
  const today = new Date(`${dayjs().tz(settings.timezone).format('YYYY-MM-DD')}T00:00:00.000Z`);
  const elapsed = await Task.find({
    user: userId,
    archived: false,
    recurring: true,
    dueDate: { $lt: today },
    status: { $in: ['todo', 'in_progress'] },
    nextOccurrenceId: null,
    recurrenceEnded: { $ne: true },
  }).limit(20);
  for (const task of elapsed) await materializeNextTaskOccurrence(userId, task);
}
