import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { sendTelegramNotification } from '../telegram/notifier.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const sent = new Set();

export async function sendSummaries(userId) {
  const settings = await getSettingsDocument(userId);
  const local = dayjs().tz(settings.timezone);
  for (const [mode, enabled, at] of [
    ['morning', settings.telegram.morningSummaryEnabled, settings.telegram.morningSummaryTime],
    ['daily', settings.telegram.dailySummaryEnabled, settings.telegram.dailySummaryTime],
  ]) {
    const key = `${userId}:${local.format('YYYY-MM-DD')}:${mode}`;
    if (!enabled || at !== local.format('HH:mm') || sent.has(key)) continue;
    const summary = await dashboardSummary(userId);
    await sendTelegramNotification(userId, {
      title: mode === 'morning' ? 'Good morning' : 'Daily wrap-up',
      message: `${summary.tasks.open} open tasks · ${summary.tasks.overdue} overdue\nNet this month: ${new Intl.NumberFormat('en-DZ').format(summary.money.net)} ${settings.defaultCurrency}`,
    });
    sent.add(key);
  }
  if (sent.size > 10000) sent.clear();
}
