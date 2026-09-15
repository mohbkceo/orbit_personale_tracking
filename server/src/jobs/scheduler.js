import cron from 'node-cron';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Bill, Subscription } from '../models/Planning.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { sendTelegramNotification } from '../telegram/notifier.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const sent = new Set();

async function updateOverdueStatuses() {
  const now = new Date();
  await Promise.all([
    Bill.updateMany({ dueDate: { $lt: now }, status: { $in: ['upcoming', 'due'] } }, { status: 'overdue' }),
    Debt.updateMany({ dueDate: { $lt: now }, status: { $in: ['unpaid', 'partial'] } }, { status: 'overdue' }),
  ]);
}

async function sendScheduledSummary() {
  const settings = await getSettingsDocument();
  if (!settings.telegram.enabled) return;
  const local = dayjs().tz(settings.timezone);
  const time = local.format('HH:mm');
  const date = local.format('YYYY-MM-DD');
  const modes = [
    ['morning', settings.telegram.morningSummaryEnabled, settings.telegram.morningSummaryTime],
    ['daily', settings.telegram.dailySummaryEnabled, settings.telegram.dailySummaryTime],
  ];
  for (const [mode, enabled, at] of modes) {
    const key = `${date}:${mode}`;
    if (!enabled || at !== time || sent.has(key)) continue;
    const summary = await dashboardSummary();
    await sendTelegramNotification({
      title: mode === 'morning' ? 'Good morning' : 'Daily wrap-up',
      message: `${summary.tasks.open} open tasks · ${summary.tasks.overdue} overdue\nNet this month: ${new Intl.NumberFormat('en-DZ').format(summary.money.net)} ${settings.defaultCurrency}`,
    });
    sent.add(key);
  }
  for (const key of sent) if (!key.startsWith(date)) sent.delete(key);
}

async function sendDueReminders() {
  const start = dayjs().startOf('day').toDate(); const end = dayjs().endOf('day').toDate();
  const [tasks, bills, subscriptions] = await Promise.all([
    Task.find({ archived: false, status: { $in: ['todo', 'in_progress'] }, dueDate: { $gte: start, $lte: end } }).limit(10),
    Bill.find({ status: { $in: ['due', 'upcoming'] }, dueDate: { $gte: start, $lte: end } }).limit(10),
    Subscription.find({ status: 'active', nextBillingDate: { $gte: start, $lte: end } }).limit(10),
  ]);
  const key = dayjs().format('YYYY-MM-DD:reminders'); if (sent.has(key) || (!tasks.length && !bills.length && !subscriptions.length)) return;
  await sendTelegramNotification({ title: 'Due today', message: [...tasks.map((v) => `Task: ${v.title}`), ...bills.map((v) => `Bill: ${v.name}`), ...subscriptions.map((v) => `Renewal: ${v.name}`)].join('\n') });
  sent.add(key);
}

export function startJobs() {
  cron.schedule('* * * * *', () => Promise.all([updateOverdueStatuses(), sendScheduledSummary()]).catch((error) => console.error('Scheduled job failed:', error.message)));
  cron.schedule('5 8 * * *', () => sendDueReminders().catch((error) => console.error('Reminder job failed:', error.message)));
}
