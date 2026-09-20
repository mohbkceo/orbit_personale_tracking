import { env } from '../config/env.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { telegramRequest } from './botClient.js';

export async function telegramStatus(userId = null) {
  let unavailable = false;
  const [webhook, connection] = await Promise.all([
    env.ORBIT_TELEGRAM_BOT_TOKEN ? telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'getWebhookInfo').catch(() => { unavailable = true; return null; }) : Promise.resolve(null),
    userId ? TelegramConnection.findOne({ user: userId }).select('lastUpdateAt') : TelegramConnection.findOne({ lastUpdateAt: { $ne: null } }).sort({ lastUpdateAt: -1 }).select('lastUpdateAt'),
  ]);
  let lastError = webhook?.last_error_message ?? (unavailable ? 'Telegram status unavailable' : null);
  if (lastError) {
    lastError = lastError.replace(/\/api\/telegram\/webhook\/[^\s/?#]+/g, '/api/telegram/webhook/***');
    lastError = lastError.replaceAll(env.TELEGRAM_WEBHOOK_SECRET, '***');
    if (env.ORBIT_TELEGRAM_BOT_TOKEN) lastError = lastError.replaceAll(env.ORBIT_TELEGRAM_BOT_TOKEN, '***');
  }
  return {
    connected: userId ? Boolean(connection) : Boolean(env.ORBIT_TELEGRAM_BOT_TOKEN && webhook),
    active: webhook ? Boolean(webhook.url) : null,
    url: webhook?.url ? '/api/telegram/webhook/***' : null,
    pendingUpdates: webhook?.pending_update_count ?? null,
    lastError,
    lastUpdateAt: connection?.lastUpdateAt ?? null,
  };
}
