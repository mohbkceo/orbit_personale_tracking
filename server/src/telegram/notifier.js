import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { checkAccess } from '../services/accessService.js';
import { canAccess } from '../services/entitlementService.js';
import { env } from '../config/env.js';
import { sendMessage } from './botClient.js';
import { sendPhoto } from './botClient.js';
import { loadBroadcastImage } from '../services/broadcastMedia.js';
import { escapeHtml } from './formatters.js';

function validTelegramUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

export async function sendTelegramNotification(userId, { title, message, buttons = [], html = false, imageId = null }) {
  if (!env.ORBIT_TELEGRAM_BOT_TOKEN) return { sent: 0 };
  const [user, connection] = await Promise.all([User.findById(userId), TelegramConnection.findOne({ user: userId })]);
  if (!user || !connection || !(await checkAccess(user)).eligible || !(await canAccess(user, 'telegram-assistant')).allowed) return { sent: 0 };
  const keyboard = buttons.length ? { inline_keyboard: buttons.map((row) => row.map((button) => {
    if (!button || typeof button.text !== 'string' || !button.text.trim() || button.text.length > 64) throw new Error('Invalid Telegram button');
    const safeUrl = validTelegramUrl(button.url);
    if (safeUrl && !button.callbackData) return { text: button.text, url: safeUrl };
    if (button.callbackData && !button.url && /^[\w:.-]{1,64}$/.test(button.callbackData)) return { text: button.text, callback_data: button.callbackData };
    throw new Error('Invalid Telegram button');
  })) } : undefined;
  const text = `<b>${html ? title : escapeHtml(title)}</b>\n\n${html ? message : escapeHtml(message)}`;
  if (imageId && text.replace(/<[^>]*>/g, '').length <=900) await sendPhoto(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, await loadBroadcastImage(imageId), 'image/jpeg', text, keyboard);
  else await sendMessage(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, text, keyboard);
  return { sent: 1 };
}
