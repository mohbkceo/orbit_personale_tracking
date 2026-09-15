import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { handleTelegramUpdate } from '../telegram/handler.js';

export const telegramRoutes = Router();
telegramRoutes.post('/webhook/:secret', asyncHandler(async (req, res) => {
  const pathSecret = Buffer.from(String(req.params.secret)); const expected = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  const headerSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  const pathValid = pathSecret.length === expected.length && crypto.timingSafeEqual(pathSecret, expected);
  const headerValid = headerSecret && Buffer.byteLength(headerSecret) === expected.length && crypto.timingSafeEqual(Buffer.from(headerSecret), expected);
  if (!pathValid || (headerSecret && !headerValid)) return res.status(403).json({ success: false, message: 'Invalid webhook secret' });
  res.status(200).json({ success: true });
  setImmediate(() => handleTelegramUpdate(req.body).catch((error) => console.error('Telegram update failed:', error.message)));
}));
