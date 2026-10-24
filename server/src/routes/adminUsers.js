import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { User } from '../models/User.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { TelegramInteraction } from '../models/TelegramInteraction.js';
import { adminAuth } from '../middleware/auth.js';
import { requireAdminCsrf, requireSuperAdmin, verifyFreshAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/query.js';
import { audit } from '../services/auditService.js';
import { createActivationLink } from '../services/activationService.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { Reminder } from '../models/Reminder.js';
import { currentSubscription } from '../services/accessService.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { resolveUserEntitlements } from '../services/entitlementService.js';
import { AuthSession } from '../models/AuthSession.js';

export const adminUserRoutes = Router();
adminUserRoutes.use(adminAuth);
const sensitive = rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20 });
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  filter: z.enum(['ALL', 'ACTIVE', 'FREE', 'SUSPENDED', 'EXPIRING_SOON']).default('ALL'),
});

adminUserRoutes.get('/', asyncHandler(async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) throw new AppError('Invalid user list query', 422);
  const { page, limit, search, filter } = parsed.data;
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  const pipeline = [];
  if (search) { const rx = new RegExp(escapeRegex(search), 'i'); pipeline.push({ $match: { $or: [{ fullName: rx }, { email: rx }] } }); }
  pipeline.push(
    { $lookup: { from: 'accesssubscriptions', let: { uid: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$user', '$$uid'] }, status: { $in: ['ACTIVE', null] } } }, { $sort: { expiresAt: -1 } }, { $limit: 1 }], as: 'access' } },
    { $lookup: { from: 'telegramconnections', localField: '_id', foreignField: 'user', as: 'telegram' } },
    { $set: { access: { $first: '$access' }, telegram: { $first: '$telegram' } } },
    { $set: { accessStatus: { $switch: { branches: [{ case: { $eq: ['$status', 'SUSPENDED'] }, then: 'SUSPENDED' }, { case: { $not: ['$access'] }, then: 'FREE' }, { case: { $lte: ['$access.expiresAt', now] }, then: 'FREE' }], default: 'ACTIVE' } } } },
  );
  if (filter === 'EXPIRING_SOON') pipeline.push({ $match: { accessStatus: 'ACTIVE', 'access.expiresAt': { $gt: now, $lte: sevenDays } } });
  else if (['ACTIVE', 'FREE', 'SUSPENDED'].includes(filter)) pipeline.push({ $match: { accessStatus: filter } });
  pipeline.push({ $project: { fullName: 1, email: 1, status: 1, createdAt: 1, lastLoginAt: 1, accessStatus: 1, access: { planSnapshot: 1, startedAt: 1, expiresAt: 1 }, telegram: { telegramUsername: 1, linkedAt: 1 } } }, { $sort: { createdAt: -1 } }, { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } });
  const [result] = await User.aggregate(pipeline);
  const total = result.count[0]?.total || 0;
  return success(res, result.rows, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

adminUserRoutes.get('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('User not found', 404);
  const [user, history, telegram, current, tasks, transactions, reminders, purchases, telegramInteractions] = await Promise.all([
    User.findById(req.params.id).select('fullName email gender status onboardingCompletedAt firstUseOnboarding createdAt lastLoginAt'),
    AccessSubscription.find({ user: req.params.id }).select('plan source grantKind grantReason paymentReference grantedBy activationLink startedAt activatedAt expiresAt status planSnapshot entitlementOverrides createdAt').sort({ activatedAt: -1 }).limit(100).lean(),
    TelegramConnection.findOne({ user: req.params.id }).select('telegramUsername linkedAt lastInteractionAt').lean(),
    currentSubscription(req.params.id),
    Task.countDocuments({ user: req.params.id }), Transaction.countDocuments({ user: req.params.id }), Reminder.countDocuments({ user: req.params.id }),
    PaymentOrder.find({ user: req.params.id }).select('state amountMinor currency planSnapshot paymentReference paidAt createdAt').sort({ createdAt: -1 }).limit(100).lean(),
    TelegramInteraction.find({ user: req.params.id }).select('kind category createdAt').sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  if (!user) throw new AppError('User not found', 404);
  const entitlements = await resolveUserEntitlements(user, { readOnly: true });
  const features = Object.entries(entitlements.decisions).map(([key, value]) => ({ key, allowed: value.allowed, limit: value.limit, reason: value.reason }));
  return success(res, { user: { id: String(user._id), fullName: user.fullName, email: user.email, gender: user.gender, status: user.status, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt, onboardingCompletedAt: user.onboardingCompletedAt, firstUseOnboarding: user.firstUseOnboarding }, access: current?.expiresAt > new Date() ? { planSnapshot: current.planSnapshot, startedAt: current.startedAt, expiresAt: current.expiresAt, status: current.status, source: current.source } : null, history, purchases, features, telegram, telegramInteractions, metrics: { tasks, transactions, reminders } });
}));

adminUserRoutes.patch('/:id/status', sensitive, requireSuperAdmin, requireAdminCsrf, validate(z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(10).max(500), adminPassword: z.string().min(1) })), verifyFreshAdmin, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('User not found', 404);
  const session = await mongoose.startSession();
  let user;
  try { await session.withTransaction(async () => {
    user = await User.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status }, $inc: { authVersion: 1 } }, { new: true, session });
    if (!user) throw new AppError('User not found', 404);
    await AuthSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    await audit(user.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'User', targetId: user._id, metadata: { reason: req.body.reason }, ip: req.ip, session });
  }); } finally { await session.endSession(); }
  if (!user) throw new AppError('User not found', 404);
  return success(res, { id: String(user._id), status: user.status });
}));

adminUserRoutes.post('/:id/renewal-link', sensitive, requireSuperAdmin, requireAdminCsrf, validate(z.strictObject({ planId: z.string().regex(/^[a-f\d]{24}$/i), validityDays: z.coerce.number().int().min(1).max(365).default(7), reason: z.string().trim().min(10).max(500), adminPassword: z.string().min(1) })), verifyFreshAdmin, asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !(await User.exists({ _id: req.params.id }))) throw new AppError('User not found', 404);
  const session = await mongoose.startSession();
  let result;
  try { await session.withTransaction(async () => {
    result = await createActivationLink(req.body.planId, req.admin._id, { validityDays: req.body.validityDays, note: `Renewal for user ${req.params.id}: ${req.body.reason}`, intendedUser: req.params.id, session });
  }); } finally { await session.endSession(); }
  return success(res, result, 201);
}));
