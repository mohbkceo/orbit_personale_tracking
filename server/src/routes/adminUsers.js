import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/query.js';
import { audit } from '../services/auditService.js';
import { createActivationLink } from '../services/activationService.js';

export const adminUserRoutes = Router();
adminUserRoutes.use(adminAuth);

adminUserRoutes.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  const pipeline = [];
  if (req.query.search) { const rx = new RegExp(escapeRegex(String(req.query.search).slice(0, 100)), 'i'); pipeline.push({ $match: { $or: [{ fullName: rx }, { email: rx }] } }); }
  pipeline.push(
    { $lookup: { from: 'accesssubscriptions', let: { uid: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$user', '$$uid'] } } }, { $sort: { expiresAt: -1 } }, { $limit: 1 }], as: 'access' } },
    { $lookup: { from: 'telegramconnections', localField: '_id', foreignField: 'user', as: 'telegram' } },
    { $set: { access: { $first: '$access' }, telegram: { $first: '$telegram' } } },
    { $set: { accessStatus: { $switch: { branches: [{ case: { $eq: ['$status', 'SUSPENDED'] }, then: 'SUSPENDED' }, { case: { $not: ['$access'] }, then: 'NO_ACCESS' }, { case: { $lte: ['$access.expiresAt', now] }, then: 'EXPIRED' }], default: 'ACTIVE' } } } },
  );
  if (req.query.filter === 'EXPIRING_SOON') pipeline.push({ $match: { accessStatus: 'ACTIVE', 'access.expiresAt': { $gt: now, $lte: sevenDays } } });
  else if (['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(req.query.filter)) pipeline.push({ $match: { accessStatus: req.query.filter } });
  pipeline.push({ $project: { fullName: 1, email: 1, status: 1, createdAt: 1, lastLoginAt: 1, accessStatus: 1, access: { planSnapshot: 1, startedAt: 1, expiresAt: 1 }, telegram: { telegramUsername: 1, linkedAt: 1 } } }, { $sort: { createdAt: -1 } }, { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } });
  const [result] = await User.aggregate(pipeline);
  const total = result.count[0]?.total || 0;
  return success(res, result.rows, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

adminUserRoutes.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('User not found', 404);
  const [user, history, telegram] = await Promise.all([User.findById(req.params.id), AccessSubscription.find({ user: req.params.id }).sort({ activatedAt: -1 }), TelegramConnection.findOne({ user: req.params.id })]);
  if (!user) throw new AppError('User not found', 404);
  const current = history[0];
  return success(res, { user: { id: String(user._id), fullName: user.fullName, email: user.email, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt }, access: current ? { ...current.toObject(), status: current.expiresAt <= new Date() ? 'EXPIRED' : current.status } : null, history, telegram });
}));

adminUserRoutes.patch('/:id/status', validate(z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) })), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('User not found', 404);
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true });
  if (!user) throw new AppError('User not found', 404);
  await audit(user.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'User', targetId: user._id });
  return success(res, { id: String(user._id), status: user.status });
}));

adminUserRoutes.post('/:id/renewal-link', validate(z.object({ planId: z.string().regex(/^[a-f\d]{24}$/i), validityDays: z.coerce.number().int().min(1).max(365).default(7) })), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !(await User.exists({ _id: req.params.id }))) throw new AppError('User not found', 404);
  return success(res, await createActivationLink(req.body.planId, req.admin._id, { validityDays: req.body.validityDays, note: `Renewal for user ${req.params.id}`, intendedUser: req.params.id }), 201);
}));
