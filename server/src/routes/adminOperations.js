import { Router } from 'express';
import { User } from '../models/User.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { ActivationLink } from '../models/ActivationLink.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { AuditLog } from '../models/AuditLog.js';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { env } from '../config/env.js';
import { telegramRequest } from '../telegram/botClient.js';
import { telegramStatus } from '../telegram/statusService.js';

export const adminOperationRoutes = Router();
adminOperationRoutes.use(adminAuth);
adminOperationRoutes.get('/dashboard', asyncHandler(async (_req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86400000);
  await ActivationLink.updateMany({ status: 'ACTIVE', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
  const [totalUsers, suspendedUsers, telegramConnected, unusedActivationLinks, latest, suspended] = await Promise.all([
    User.countDocuments(), User.countDocuments({ status: 'SUSPENDED' }), TelegramConnection.countDocuments(), ActivationLink.countDocuments({ status: 'ACTIVE', expiresAt: { $gt: now } }),
    AccessSubscription.aggregate([{ $sort: { expiresAt: -1 } }, { $group: { _id: '$user', latest: { $first: '$$ROOT' } } }, { $replaceRoot: { newRoot: '$latest' } }]),
    User.find({ status: 'SUSPENDED' }).select('_id'),
  ]);
  const suspendedIds = new Set(suspended.map((item) => String(item._id)));
  const active = latest.filter((item) => item.expiresAt > now && !suspendedIds.has(String(item.user))).length;
  const expiringSoon = latest.filter((item) => item.expiresAt > now && item.expiresAt <= soon && !suspendedIds.has(String(item.user))).length;
  const [expiring, activations, links] = await Promise.all([
    AccessSubscription.find({ _id: { $in: latest.filter((item) => item.expiresAt > now && item.expiresAt <= soon && !suspendedIds.has(String(item.user))).map((item) => item._id) } }).populate('user', 'fullName email').sort({ expiresAt: 1 }).limit(10),
    AccessSubscription.find().populate('user', 'fullName email').sort({ activatedAt: -1 }).limit(10),
    ActivationLink.find().populate('plan', 'name').sort({ createdAt: -1 }).limit(10),
  ]);
  return success(res, { metrics: { totalUsers, activeAccess: active, expiredAccess: latest.filter((item) => item.expiresAt <= now && !suspendedIds.has(String(item.user))).length, suspendedUsers, telegramConnected, expiringSoon, unusedActivationLinks }, expiring, activations, links });
}));
adminOperationRoutes.get('/activity', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const [rows, total] = await Promise.all([AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), AuditLog.countDocuments()]);
  return success(res, rows, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
adminOperationRoutes.get('/settings', adminRoleGuard('SUPER_ADMIN'), (_req, res) => success(res, { telegramConfigured: Boolean(env.ORBIT_TELEGRAM_BOT_TOKEN), botUsername: env.ORBIT_TELEGRAM_BOT_USERNAME || null, webhookConfigured: Boolean(env.TELEGRAM_WEBHOOK_SECRET) }));
adminOperationRoutes.post('/settings/telegram/webhook/register', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/api/telegram/webhook/${env.TELEGRAM_WEBHOOK_SECRET}`;
  await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] });
  await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'setMyCommands', { commands: [
    'start', 'today', 'quick', 'tasks', 'debts', 'sales', 'money', 'expenses', 'income',
    'accounts', 'month', 'bills', 'subscriptions', 'goals', 'last', 'reminders', 'help', 'cancel',
  ].map((command) => ({ command, description: command === 'quick' ? 'Quick Add' : command[0].toUpperCase() + command.slice(1) })) });
  return success(res, { active: true });
}));
adminOperationRoutes.get('/settings/telegram/status', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  return success(res, await telegramStatus());
}));
adminOperationRoutes.post('/settings/telegram/webhook/remove', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'deleteWebhook', { drop_pending_updates: false });
  return success(res, { active: false });
}));
