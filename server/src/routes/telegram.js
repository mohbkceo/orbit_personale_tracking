import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleTelegramUpdate } from '../telegram/handler.js';
import { telegramStatus } from '../telegram/statusService.js';
import { userAuth } from '../middleware/auth.js';
import { success } from '../utils/api.js';

export const telegramRoutes = Router();
telegramRoutes.get('/status', userAuth, asyncHandler(async (req, res) => success(res, await telegramStatus(req.user._id))));
telegramRoutes.post('/webhook/:secret', asyncHandler(async (req, res) => {
  const pathSecret = Buffer.from(String(req.params.secret)); const expected = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  const headerSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  const pathValid = pathSecret.length === expected.length && crypto.timingSafeEqual(pathSecret, expected);
  const headerValid = headerSecret && Buffer.byteLength(headerSecret) === expected.length && crypto.timingSafeEqual(Buffer.from(headerSecret), expected);
  if (!pathValid || !headerValid) return res.status(403).json({ success: false, message: 'Invalid webhook secret' });
  res.status(200).json({ success: true });
  setImmediate(() => handleTelegramUpdate(req.body).catch((error) => console.error('Telegram update failed:', error.message)));
}));
