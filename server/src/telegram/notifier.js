import { getSettingsDocument, telegramToken } from '../services/settingsService.js';
import { sendMessage } from './botClient.js';

export async function sendTelegramNotification({ title, message, buttons = [] }) {
  const settings = await getSettingsDocument();
  if (!settings.telegram.enabled) return { sent: 0 };
  const token = telegramToken(settings);
  const keyboard = buttons.length ? { inline_keyboard: buttons.map((row) => row.map((button) => ({ text: button.text, callback_data: button.callbackData }))) } : undefined;
  const results = await Promise.allSettled(settings.telegram.allowedTelegramUserIds.map((id) => sendMessage(token, id, `<b>${title}</b>\n\n${message}`, keyboard)));
  return { sent: results.filter((item) => item.status === 'fulfilled').length, failed: results.filter((item) => item.status === 'rejected').length };
}
