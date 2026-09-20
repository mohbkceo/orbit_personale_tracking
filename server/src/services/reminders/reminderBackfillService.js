import dayjs from 'dayjs';
import { Task } from '../../models/Task.js';
import { Debt } from '../../models/Debt.js';
import { Bill, Subscription, Goal } from '../../models/Planning.js';
import { regenerateAutomaticReminderPlan } from './reminderService.js';

export async function backfillUpcomingReminders(userId, { maxPerType = 100 } = {}) {
  const now = new Date();
  const end = dayjs(now).add(60, 'day').toDate();
  const start = dayjs(now).subtract(1, 'day').toDate();
  const targets = [
    [
      'task',
      Task,
      {
        archived: false,
        status: { $in: ['todo', 'in_progress'] },
        dueDate: { $gte: start, $lte: end },
      },
    ],
    [
      'debt',
      Debt,
      {
        archived: false,
        status: { $in: ['unpaid', 'partial', 'overdue'] },
        remainingAmount: { $gt: 0 },
        dueDate: { $gte: start, $lte: end },
      },
    ],
    [
      'bill',
      Bill,
      { status: { $in: ['upcoming', 'due', 'overdue'] }, dueDate: { $gte: start, $lte: end } },
    ],
    [
      'subscription',
      Subscription,
      { status: 'active', nextBillingDate: { $gte: start, $lte: end } },
    ],
    ['goal', Goal, { status: 'active' }],
  ];
  const counts = {};
  for (const [type, Model, filter] of targets) {
    const entities = await Model.find({ user: userId, ...filter })
      .sort({ _id: 1 })
      .limit(maxPerType)
      .select('_id');
    for (const entity of entities) await regenerateAutomaticReminderPlan(userId, type, entity._id);
    counts[type] = entities.length;
  }
  return counts;
}
