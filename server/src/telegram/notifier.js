import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { checkAccess } from '../services/accessService.js';
import { env } from '../config/env.js';
import { sendMessage } from './botClient.js';
import { escapeHtml } from './formatters.js';

function validTelegramUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export async function sendTelegramNotification(userId, { title, message, buttons = [] }) {
  if (!env.ORBIT_TELEGRAM_BOT_TOKEN) return { sent: 0 };
  const [user, connection] = await Promise.all([User.findById(userId), TelegramConnection.findOne({ user: userId })]);
  if (!user || !connection || !(await checkAccess(user)).eligible) return { sent: 0 };
  const keyboard = buttons.length ? { inline_keyboard: buttons.map((row) => row.map((button) => {
    if (!button || typeof button.text !== 'string' || !button.text.trim() || button.text.length > 64) throw new Error('Invalid Telegram button');
    const safeUrl = validTelegramUrl(button.url);
    if (safeUrl && !button.callbackData) return { text: button.text, url: safeUrl };
    if (button.callbackData && !button.url && /^[\w:.-]{1,64}$/.test(button.callbackData)) return { text: button.text, callback_data: button.callbackData };
    throw new Error('Invalid Telegram button');
  })) } : undefined;
  await sendMessage(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(message)}`, keyboard);
  return { sent: 1 };
}
