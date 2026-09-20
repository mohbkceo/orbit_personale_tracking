import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { checkAccess } from '../services/accessService.js';
import { env } from '../config/env.js';
import { sendMessage } from './botClient.js';
import { escapeHtml } from './formatters.js';

export async function sendTelegramNotification(userId, { title, message, buttons = [] }) {
  if (!env.ORBIT_TELEGRAM_BOT_TOKEN) return { sent: 0 };
  const [user, connection] = await Promise.all([User.findById(userId), TelegramConnection.findOne({ user: userId })]);
  if (!user || !connection || !(await checkAccess(user)).eligible) return { sent: 0 };
  const keyboard = buttons.length ? { inline_keyboard: buttons.map((row) => row.map((button) => ({ text: button.text, callback_data: button.callbackData }))) } : undefined;
  await sendMessage(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}`, keyboard);
  return { sent: 1 };
}
