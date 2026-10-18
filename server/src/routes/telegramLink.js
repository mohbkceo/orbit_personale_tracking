import { Router } from 'express';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { createTelegramLink, unlinkTelegram } from '../services/telegramLinkService.js';
import { env } from '../config/env.js';

export const telegramLinkRoutes = Router();
telegramLinkRoutes.get('/', asyncHandler(async (req, res) => {
  const row = await TelegramConnection.findOne({ user: req.user._id });
  const botUrl = env.ORBIT_TELEGRAM_BOT_USERNAME ? `https://t.me/${env.ORBIT_TELEGRAM_BOT_USERNAME.replace(/^@/, '')}` : null;
  return success(res, row ? { connected: true, telegramUsername: row.telegramUsername, linkedAt: row.linkedAt, lastInteractionAt: row.lastInteractionAt, botUrl } : { connected: false, botUrl });
}));
telegramLinkRoutes.post('/', asyncHandler(async (req, res, next) => {
  if (req.user.status !== 'ACTIVE') throw new AppError('Your Orbit account is suspended.', 403, undefined, 'USER_SUSPENDED');
  next();
}), asyncHandler(async (req, res) => success(res, await createTelegramLink(req.user._id), 201)));
telegramLinkRoutes.delete('/', asyncHandler(async (req, res) => success(res, { disconnected: await unlinkTelegram(req.user._id) })));
