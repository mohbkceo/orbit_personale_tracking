import { Setting } from '../models/Setting.js';
import { ensureAccount } from './financeService.js';

export async function getSettingsDocument(userId) {
  return Setting.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

export function publicSettings(settings) {
  return settings.toObject ? settings.toObject() : settings;
}

export async function updateSettings(userId, input) {
  const settings = await getSettingsDocument(userId);
  const telegramInput = input.telegram || {};
  for (const key of ['defaultExpenseAccount', 'defaultIncomeAccount']) if (telegramInput[key]) await ensureAccount(userId, telegramInput[key]);
  Object.assign(settings, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'telegram')));
  Object.assign(settings.telegram, telegramInput);
  await settings.save();
  return settings;
}
