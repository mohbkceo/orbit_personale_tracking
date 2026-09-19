import { Router } from 'express';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { checkAccess } from '../services/accessService.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { createTelegramLink, unlinkTelegram } from '../services/telegramLinkService.js';

export const telegramLinkRoutes = Router();
telegramLinkRoutes.get('/', asyncHandler(async (req, res) => {
  const row = await TelegramConnection.findOne({ user: req.user._id });
  return success(res, row ? { connected: true, telegramUsername: row.telegramUsername, linkedAt: row.linkedAt, lastInteractionAt: row.lastInteractionAt } : { connected: false });
}));
telegramLinkRoutes.post('/', asyncHandler(async (req, res, next) => {
  if (!req.user.onboardingCompletedAt && req.user.status === 'ACTIVE') return next();
  const access = await checkAccess(req.user);
  if (!access.eligible) throw new AppError('Your Orbit access has expired.', 403, undefined, 'ACCESS_EXPIRED');
  next();
}), asyncHandler(async (req, res) => success(res, await createTelegramLink(req.user._id), 201)));
telegramLinkRoutes.delete('/', asyncHandler(async (req, res) => success(res, { disconnected: await unlinkTelegram(req.user._id) })));
