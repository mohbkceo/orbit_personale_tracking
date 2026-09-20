import { Setting } from '../models/Setting.js';
import { env } from '../config/env.js';
import { ensureAccount } from './financeService.js';
import { backfillUpcomingReminders } from './reminders/reminderBackfillService.js';

export async function getSettingsDocument(userId) {
  return Setting.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

export function publicSettings(settings) {
  const data = settings.toObject ? settings.toObject() : { ...settings };
  if (data.telegram) {
    const telegram = data.telegram;
    data.telegram = {
      defaultExpenseAccount: telegram.defaultExpenseAccount ?? null,
      defaultIncomeAccount: telegram.defaultIncomeAccount ?? null,
      dailySummaryEnabled: Boolean(telegram.dailySummaryEnabled),
      dailySummaryTime: telegram.dailySummaryTime ?? '20:00',
      morningSummaryEnabled: Boolean(telegram.morningSummaryEnabled),
      morningSummaryTime: telegram.morningSummaryTime ?? '08:00',
      webhookConfigured: Boolean(telegram.webhookUrl || (env.ORBIT_TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET)),
    };
  }
  return data;
}

export async function updateSettings(userId, input) {
  const settings = await getSettingsDocument(userId);
  const remindersPreviouslyEnabled = settings.reminders?.enabled && settings.reminders?.automaticEnabled;
  const telegramInput = input.telegram || {};
  for (const key of ['defaultExpenseAccount', 'defaultIncomeAccount']) if (telegramInput[key]) await ensureAccount(userId, telegramInput[key]);
  Object.assign(settings, Object.fromEntries(Object.entries(input).filter(([key]) => !['telegram', 'reminders'].includes(key))));
  Object.assign(settings.telegram, telegramInput);
  if (input.reminders) {
    for (const [key, value] of Object.entries(input.reminders)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) Object.assign(settings.reminders[key], value);
      else settings.reminders[key] = value;
    }
  }
  await settings.save();
  if (!remindersPreviouslyEnabled && settings.reminders?.enabled && settings.reminders?.automaticEnabled) await backfillUpcomingReminders(userId);
  return settings;
}
