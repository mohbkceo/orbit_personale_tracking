import mongoose from 'mongoose';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { AuditLog } from '../models/AuditLog.js';
import { Feature } from '../models/Feature.js';
import { UserFeatureOverride } from '../models/UserFeatureOverride.js';
import { AdminSupportNote } from '../models/AdminSupportNote.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { TelegramLinkToken } from '../models/TelegramLinkToken.js';
import { TelegramSession } from '../models/TelegramSession.js';
import { SupportSession } from '../models/SupportSession.js';
import { adminAuth } from '../middleware/auth.js';
import {
  requireAdminCsrf,
  requireSuperAdmin,
  verifyFreshAdmin,
} from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { createAdminGrant, revokeAdminGrant } from '../services/adminGrantService.js';
import { initiateAccountAction } from '../services/accountRecoveryService.js';
import { applyBulkUserAction, deleteUserAccount } from '../services/adminUserLifecycleService.js';

export const adminUserActionRoutes = Router();
const id = z.string().regex(/^[a-f\d]{24}$/i);
const reason = z.string().trim().min(10).max(500);
const password = z.string().min(1);
const sensitive = rateLimit({
  windowMs: 15 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
});
adminUserActionRoutes.use(adminAuth, requireSuperAdmin);
adminUserActionRoutes.post(
  '/bulk',
  sensitive,
  requireAdminCsrf,
  validate(
    z
      .strictObject({
        ids: z.array(id).min(1).max(20).refine((ids) => new Set(ids.map((item) => item.toLowerCase())).size === ids.length, 'Duplicate users are not allowed'),
        action: z.enum(['SUSPEND', 'UNSUSPEND', 'REVOKE_SESSIONS', 'DELETE']),
        reason,
        adminPassword: password,
        confirmation: z.string().max(40).optional(),
      })
      .superRefine((value, ctx) => {
        if (value.action === 'DELETE' && value.confirmation !== `DELETE ${value.ids.length}`)
          ctx.addIssue({ code: 'custom', path: ['confirmation'], message: 'Type the delete confirmation exactly' });
      }),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const ids = req.body.ids.map((item) => item.toLowerCase());
    if (req.body.action !== 'DELETE')
      return success(res, {
        action: req.body.action,
        results: await applyBulkUserAction(ids, req.body.action, req.admin._id, req.body.reason, req.ip),
      });
    const results = [];
    for (const userId of ids) {
      try {
        await deleteUserAccount(userId, req.admin._id, req.body.reason, req.ip);
        results.push({ id: userId, deleted: true });
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        results.push({ id: userId, deleted: false, error: error.message });
        await audit('ADMIN_USER_DELETE_BLOCKED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: userId,
          metadata: { reason: req.body.reason, status: error.statusCode || error.status },
          ip: req.ip,
        });
      }
    }
    return success(res, { action: 'DELETE', results });
  }),
);
adminUserActionRoutes.use('/:id', (req, _res, next) =>
  id.safeParse(req.params.id).success ? next() : next(new AppError('User not found', 404)),
);

adminUserActionRoutes.delete(
  '/:id',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password, confirmationEmail: z.email() })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) =>
    success(
      res,
      await deleteUserAccount(
        req.params.id,
        req.admin._id,
        req.body.reason,
        req.ip,
        req.body.confirmationEmail,
      ),
    ),
  ),
);

adminUserActionRoutes.get(
  '/:id/management',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select(
        'fullName email gender status onboardingCompletedAt firstUseOnboarding createdAt lastLoginAt authVersion',
      )
      .lean();
    if (!user) throw new AppError('User not found', 404);
    const [sessions, supportSessions, overrides, notes, events] = await Promise.all([
      AuthSession.find({ user: user._id, expiresAt: { $gt: new Date() } })
        .select('createdAt expiresAt revokedAt lastSeenAt ip userAgent')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      SupportSession.find({ user: user._id })
        .select('admin reason scope createdAt expiresAt revokedAt revokedReason')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      UserFeatureOverride.find({ user: user._id })
        .select('key enabled limit value reason updatedAt')
        .lean(),
      AdminSupportNote.find({ user: user._id })
        .select('text createdAt admin')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
      AuditLog.find({
        $or: [
          { targetType: 'User', targetId: user._id },
          { actorType: 'USER', actorId: user._id },
        ],
      })
        .select('event actorType actorId targetType targetId createdAt')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
    ]);
    return success(res, { user, sessions, supportSessions, overrides, notes, events });
  }),
);

adminUserActionRoutes.post(
  '/:id/support-sessions/:sessionId/revoke',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    if (!id.safeParse(req.params.sessionId).success)
      throw new AppError('Support session not found', 404);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await SupportSession.updateOne(
          { _id: req.params.sessionId, user: req.params.id, revokedAt: null },
          { $set: { revokedAt: new Date(), revokedReason: 'ADMIN_REVOKED' } },
          { session },
        );
        if (!updated.matchedCount) throw new AppError('Support session not found', 404);
        await audit('SUPPORT_SESSION_REVOKED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: {
            supportSessionId: req.params.sessionId,
            reason: req.body.reason,
            scope: 'READ_ONLY',
          },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { revoked: true });
  }),
);

adminUserActionRoutes.patch(
  '/:id/profile',
  requireAdminCsrf,
  validate(
    z.strictObject({
      fullName: z.string().trim().min(2).max(120),
      gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
      reason,
    }),
  ),
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let user;
    try {
      await session.withTransaction(async () => {
        user = await User.findByIdAndUpdate(
          req.params.id,
          {
            $set: {
              fullName: req.body.fullName,
              ...(req.body.gender === null
                ? {}
                : req.body.gender
                  ? { gender: req.body.gender }
                  : {}),
            },
            ...(req.body.gender === null ? { $unset: { gender: 1 } } : {}),
          },
          { new: true, runValidators: true, session },
        );
        if (!user) throw new AppError('User not found', 404);
        await audit('ADMIN_USER_PROFILE_UPDATED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: user._id,
          metadata: {
            reason: req.body.reason,
            fields: ['fullName', ...(req.body.gender !== undefined ? ['gender'] : [])],
          },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { fullName: user.fullName, gender: user.gender });
  }),
);

adminUserActionRoutes.post(
  '/:id/onboarding/reset',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await User.updateOne(
          { _id: req.params.id },
          {
            $set: { firstUseOnboarding: { status: 'NOT_STARTED', step: 'welcome', autoPresent: true } },
            $unset: { planSelectionSkippedAt: 1 },
          },
          { session },
        );
        if (!updated.matchedCount) throw new AppError('User not found', 404);
        await audit('ADMIN_ONBOARDING_RESET', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: { reason: req.body.reason },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { reset: true });
  }),
);

adminUserActionRoutes.post(
  '/:id/sessions/revoke',
  sensitive,
  requireAdminCsrf,
  validate(
    z
      .strictObject({
        sessionId: id.optional(),
        all: z.boolean().optional(),
        reason,
        adminPassword: password,
      })
      .refine(
        (value) => Boolean(value.sessionId) !== Boolean(value.all),
        'Select one session or all sessions',
      ),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (req.body.all) {
          const updated = await User.updateOne(
            { _id: req.params.id },
            { $inc: { authVersion: 1 } },
            { session },
          );
          if (!updated.matchedCount) throw new AppError('User not found', 404);
          await AuthSession.updateMany(
            { user: req.params.id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
            { session },
          );
        } else {
          const updated = await AuthSession.updateOne(
            { _id: req.body.sessionId, user: req.params.id, revokedAt: null },
            { $set: { revokedAt: new Date() } },
            { session },
          );
          if (!updated.matchedCount) throw new AppError('Session not found', 404);
        }
        await audit('ADMIN_USER_SESSIONS_REVOKED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: {
            all: Boolean(req.body.all),
            sessionId: req.body.sessionId || null,
            reason: req.body.reason,
          },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { revoked: true });
  }),
);

adminUserActionRoutes.post(
  '/:id/telegram/disconnect',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (!(await User.exists({ _id: req.params.id }).session(session)))
          throw new AppError('User not found', 404);
        const connection = await TelegramConnection.findOne({ user: req.params.id })
          .select('telegramUserId')
          .session(session);
        await TelegramConnection.deleteOne({ user: req.params.id }, { session });
        await TelegramLinkToken.deleteMany(
          { user: req.params.id, consumedAt: null },
          { session },
        );
        if (connection)
          await TelegramSession.deleteMany(
            { telegramUserId: connection.telegramUserId },
            { session },
          );
        await audit('ADMIN_TELEGRAM_DISCONNECTED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: { reason: req.body.reason },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { disconnected: true });
  }),
);

adminUserActionRoutes.post(
  '/:id/notes',
  requireAdminCsrf,
  validate(z.strictObject({ text: z.string().trim().min(1).max(2000) })),
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let note;
    try {
      await session.withTransaction(async () => {
        if (!(await User.exists({ _id: req.params.id }).session(session)))
          throw new AppError('User not found', 404);
        [note] = await AdminSupportNote.create(
          [{ user: req.params.id, admin: req.admin._id, text: req.body.text }],
          { session },
        );
        await audit('ADMIN_SUPPORT_NOTE_ADDED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: { noteId: String(note._id) },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { id: note.id, createdAt: note.createdAt }, 201);
  }),
);

adminUserActionRoutes.post(
  '/:id/account-action',
  sensitive,
  requireAdminCsrf,
  validate(
    z
      .strictObject({
        kind: z.enum(['EMAIL_CHANGE', 'PASSWORD_RESET']),
        newEmail: z.email().optional(),
        reason,
        adminPassword: password,
      })
      .superRefine((value, ctx) => {
        if (value.kind === 'EMAIL_CHANGE' && !value.newEmail)
          ctx.addIssue({ code: 'custom', path: ['newEmail'], message: 'New email required' });
      }),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) =>
    success(
      res,
      await initiateAccountAction(
        req.params.id,
        req.admin._id,
        req.body.kind,
        req.body.newEmail,
        req.body.reason,
        req.ip,
      ),
    ),
  ),
);

adminUserActionRoutes.post(
  '/:id/grants',
  sensitive,
  requireAdminCsrf,
  validate(
    z
      .strictObject({
        mode: z.enum(['ASSIGN', 'EXTEND']),
        planId: id.optional(),
        durationDays: z.number().int().min(1).max(3650).optional(),
        grantKind: z.enum(['PAYMENT_CONFIRMED', 'COMPLIMENTARY', 'SUPPORT_COMPENSATION']),
        paymentReference: z.string().trim().min(4).max(120).optional(),
        reason,
        idempotencyKey: z.uuid(),
        adminPassword: password,
      })
      .superRefine((value, ctx) => {
        if (value.mode === 'ASSIGN' && !value.planId)
          ctx.addIssue({ code: 'custom', message: 'Plan required', path: ['planId'] });
        if (value.mode === 'EXTEND' && !value.durationDays)
          ctx.addIssue({ code: 'custom', message: 'Duration required', path: ['durationDays'] });
        if (value.grantKind === 'PAYMENT_CONFIRMED' && !value.paymentReference)
          ctx.addIssue({
            code: 'custom',
            message: 'Payment reference required',
            path: ['paymentReference'],
          });
      }),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const grant = await createAdminGrant(req.params.id, req.admin._id, req.body, req.ip);
    return success(
      res,
      {
        id: grant.id,
        source: grant.source,
        grantKind: grant.grantKind,
        expiresAt: grant.expiresAt,
      },
      201,
    );
  }),
);

adminUserActionRoutes.post(
  '/:id/grants/:grantId/revoke',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    if (!id.safeParse(req.params.grantId).success) throw new AppError('Grant not found', 404);
    await revokeAdminGrant(
      req.params.id,
      req.params.grantId,
      req.admin._id,
      req.body.reason,
      req.ip,
    );
    return success(res, { revoked: true });
  }),
);

adminUserActionRoutes.put(
  '/:id/overrides/:key',
  sensitive,
  requireAdminCsrf,
  validate(
    z.strictObject({
      enabled: z.boolean(),
      limit: z.number().int().min(0).nullable().optional(),
      value: z.string().trim().max(240).optional(),
      reason,
      adminPassword: password,
    }),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const feature = await Feature.findOne({ key: req.params.key });
    if (!feature || feature.status !== 'ACTIVE' || feature.accessMode === 'DISABLED')
      throw new AppError('Feature unavailable', 404);
    if (feature.type === 'LIMIT' && req.body.enabled && req.body.limit == null)
      throw new AppError('Limit required', 422);
    if (feature.type !== 'LIMIT' && req.body.limit != null)
      throw new AppError('Limit is not supported', 422);
    if (feature.type === 'TEXT' && req.body.enabled && !req.body.value)
      throw new AppError('Value required for this feature', 422);
    if (feature.type !== 'TEXT' && req.body.value)
      throw new AppError('Value is not supported', 422);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (!(await User.exists({ _id: req.params.id }).session(session)))
          throw new AppError('User not found', 404);
        await UserFeatureOverride.updateOne(
          { user: req.params.id, key: feature.key },
          {
            $set: {
              enabled: req.body.enabled,
              reason: req.body.reason,
              updatedBy: req.admin._id,
              ...(feature.type === 'LIMIT' && req.body.enabled ? { limit: req.body.limit } : {}),
              ...(feature.type === 'TEXT' && req.body.enabled ? { value: req.body.value } : {}),
            },
            $unset: {
              ...(feature.type !== 'LIMIT' || !req.body.enabled ? { limit: 1 } : {}),
              ...(feature.type !== 'TEXT' || !req.body.enabled ? { value: 1 } : {}),
            },
          },
          { upsert: true, session },
        );
        await audit('ADMIN_USER_FEATURE_OVERRIDE', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: {
            key: feature.key,
            enabled: req.body.enabled,
            limit: req.body.limit ?? null,
            reason: req.body.reason,
          },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { updated: true });
  }),
);

adminUserActionRoutes.delete(
  '/:id/overrides/:key',
  sensitive,
  requireAdminCsrf,
  validate(z.strictObject({ reason, adminPassword: password })),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await UserFeatureOverride.deleteOne(
          { user: req.params.id, key: req.params.key },
          { session },
        );
        await audit('ADMIN_USER_FEATURE_OVERRIDE_REMOVED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.params.id,
          metadata: { key: req.params.key, reason: req.body.reason },
          ip: req.ip,
          session,
        });
      });
    } finally {
      await session.endSession();
    }
    return success(res, { removed: true });
  }),
);
