import { Router } from 'express';
import { env } from '../config/env.js';
import { validate } from '../middleware/validate.js';
import { settingsInput } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getSettingsDocument, publicSettings, telegramToken, updateSettings } from '../services/settingsService.js';
import { telegramRequest } from '../telegram/botClient.js';
import { recordActivity } from '../services/activityService.js';

export const settingsRoutes = Router();
settingsRoutes.get('/', asyncHandler(async (_req, res) => success(res, publicSettings(await getSettingsDocument()))));
settingsRoutes.patch('/', validate(settingsInput), asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.body);
  await recordActivity({ action: 'updated', entityType: 'Settings', entityId: settings._id, description: 'Settings updated' });
  return success(res, publicSettings(settings));
}));
settingsRoutes.post('/telegram/test', asyncHandler(async (_req, res) => { const settings = await getSettingsDocument(); const bot = await telegramRequest(telegramToken(settings), 'getMe'); return success(res, { connected: true, username: `@${bot.username}`, name: bot.first_name }); }));
settingsRoutes.post('/telegram/webhook/register', asyncHandler(async (_req, res) => {
  const settings = await getSettingsDocument(); const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/api/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;
  await telegramRequest(telegramToken(settings), 'setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
  settings.telegram.webhookUrl = url; await settings.save(); return success(res, { active: true, webhookUrl: url.replace(env.TELEGRAM_WEBHOOK_SECRET, '***') });
}));
settingsRoutes.post('/telegram/webhook/remove', asyncHandler(async (_req, res) => { const settings = await getSettingsDocument(); await telegramRequest(telegramToken(settings), 'deleteWebhook', { drop_pending_updates: false }); settings.telegram.webhookUrl = ''; await settings.save(); return success(res, { active: false }); }));
settingsRoutes.get('/telegram/status', asyncHandler(async (_req, res) => { const settings = await getSettingsDocument(); const info = await telegramRequest(telegramToken(settings), 'getWebhookInfo'); return success(res, { connected: true, active: Boolean(info.url), url: info.url ? info.url.replace(/\/webhook\/[^/]+$/, '/webhook/***') : '', pendingUpdates: info.pending_update_count, lastError: info.last_error_message, lastUpdateAt: settings.telegram.lastUpdateAt }); }));
