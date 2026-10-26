import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { sendTelegramNotification } from '../telegram/notifier.js';
import { canAccess } from '../services/entitlementService.js';
import { telegramText as tr } from '../i18n/telegram.js';
import { renderAutomaticMessage } from '../services/automaticMessages.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const sent = new Set();

export async function sendSummaries(userId) {
  if (!(await canAccess(userId, 'dashboard')).allowed || !(await canAccess(userId, 'tasks')).allowed || !(await canAccess(userId, 'transactions')).allowed) return;
  const settings = await getSettingsDocument(userId);
  const local = dayjs().tz(settings.timezone);
  for (const [mode, enabled, at] of [
    ['morning', settings.telegram.morningSummaryEnabled, settings.telegram.morningSummaryTime],
    ['daily', settings.telegram.dailySummaryEnabled, settings.telegram.dailySummaryTime],
  ]) {
    const key = `${userId}:${local.format('YYYY-MM-DD')}:${mode}`;
    if (!enabled || at !== local.format('HH:mm') || sent.has(key)) continue;
    const summary = await dashboardSummary(userId);
    const title = tr(settings, mode === 'morning' ? 'morningGreeting' : 'dailyWrapUp');
    const message = `${summary.tasks.open} ${tr(settings, 'open')} ${tr(settings, 'tasks')} · ${summary.tasks.overdue} ${tr(settings, 'overdue')}\n${tr(settings, 'net')} ${tr(settings, 'thisMonth')}: ${new Intl.NumberFormat(settings.language === 'ar' ? 'ar-DZ' : 'en-DZ').format(summary.money.net)} ${settings.defaultCurrency}`;
    const rendered = await renderAutomaticMessage(`summary-${mode}`, settings.language, { legacyTitle: title, legacyMessage: message, openTasks: summary.tasks.open, overdueTasks: summary.tasks.overdue, netAmount: summary.money.net, currency: settings.defaultCurrency });
    if (!rendered) continue;
    await sendTelegramNotification(userId, rendered);
    sent.add(key);
  }
  if (sent.size > 10000) sent.clear();
}
