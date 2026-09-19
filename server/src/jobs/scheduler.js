import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Bill, Subscription } from '../models/Planning.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { checkAccess } from '../services/accessService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { sendTelegramNotification } from '../telegram/notifier.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const sent = new Set();

async function updateOverdueStatuses(userId) {
  const now = new Date();
  await Promise.all([
    Bill.updateMany({ user: userId, dueDate: { $lt: now }, status: { $in: ['upcoming', 'due'] } }, { status: 'overdue' }),
    Debt.updateMany({ user: userId, dueDate: { $lt: now }, status: { $in: ['unpaid', 'partial'] } }, { status: 'overdue' }),
  ]);
}

async function sendForUser(user, connection) {
  if (!(await checkAccess(user)).eligible) return;
  const settings = await getSettingsDocument(user._id);
  const local = dayjs().tz(settings.timezone);
  const time = local.format('HH:mm');
  const date = local.format('YYYY-MM-DD');
  const modes = [
    ['morning', settings.telegram.morningSummaryEnabled, settings.telegram.morningSummaryTime],
    ['daily', settings.telegram.dailySummaryEnabled, settings.telegram.dailySummaryTime],
  ];
  for (const [mode, enabled, at] of modes) {
    const key = `${user._id}:${date}:${mode}`;
    if (!enabled || at !== time || sent.has(key)) continue;
    const summary = await dashboardSummary(user._id);
    await sendTelegramNotification(user._id, { title: mode === 'morning' ? 'Good morning' : 'Daily wrap-up', message: `${summary.tasks.open} open tasks · ${summary.tasks.overdue} overdue\nNet this month: ${new Intl.NumberFormat('en-DZ').format(summary.money.net)} ${settings.defaultCurrency}` });
    sent.add(key);
  }
  if (time === '08:05') {
    const key = `${user._id}:${date}:reminders`;
    if (!sent.has(key)) {
      const start = local.startOf('day').toDate();
      const end = local.endOf('day').toDate();
      const [tasks, bills, subscriptions] = await Promise.all([
        Task.find({ user: user._id, archived: false, status: { $in: ['todo', 'in_progress'] }, dueDate: { $gte: start, $lte: end } }).limit(10),
        Bill.find({ user: user._id, status: { $in: ['due', 'upcoming'] }, dueDate: { $gte: start, $lte: end } }).limit(10),
        Subscription.find({ user: user._id, status: 'active', nextBillingDate: { $gte: start, $lte: end } }).limit(10),
      ]);
      const items = [...tasks.map((v) => `Task: ${v.title}`), ...bills.map((v) => `Bill: ${v.name}`), ...subscriptions.map((v) => `Renewal: ${v.name}`)];
      if (items.length) await sendTelegramNotification(user._id, { title: 'Due today', message: items.join('\n') });
      sent.add(key);
    }
  }
  if (!connection.chatId) return;
}

export async function runJobsOnce() {
  const users = await User.find({ status: 'ACTIVE' }).select('_id status');
  const connections = await TelegramConnection.find({ user: { $in: users.map((user) => user._id) } });
  const byUser = new Map(connections.map((row) => [String(row.user), row]));
  for (const user of users) {
    await updateOverdueStatuses(user._id);
    const connection = byUser.get(String(user._id));
    if (connection) await sendForUser(user, connection);
  }
  if (sent.size > 10000) sent.clear();
}

export function startJobs() {
  cron.schedule('* * * * *', () => runJobsOnce().catch((error) => console.error('Scheduled job failed:', error.message)));
}
