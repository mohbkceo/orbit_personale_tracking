import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';
import { requireAdminCsrf, verifyFreshAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { SupportSession } from '../models/SupportSession.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Reminder } from '../models/Reminder.js';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { Debt } from '../models/Debt.js';
import { Bill, Subscription, Goal } from '../models/Planning.js';
import { Contact, Project, Note, Habit, Wishlist } from '../models/Personal.js';
import { Setting } from '../models/Setting.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { resolveUserEntitlements } from '../services/entitlementService.js';
import { accountBalances } from '../services/financeService.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { audit } from '../services/auditService.js';
import { env } from '../config/env.js';
import { expireSupportSession } from '../services/supportSessionService.js';

export const adminSupportRoutes = Router();
const cookie = 'orbit_support';
const options = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
};
const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
const id = z.string().regex(/^[a-f\d]{24}$/i);
const limit = rateLimit({
  windowMs: 15 * 60_000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 8,
});

const resources = {
  tasks: [Task, 'tasks', 'title status priority dueDate dueTime createdAt updatedAt', { archived: false }],
  reminders: [Reminder, 'reminders', 'title status nextTriggerAt priority createdAt'],
  accounts: [Account, 'accounts', 'name type currency openingBalance archived createdAt', { archived: false }],
  transactions: [
    Transaction,
    'transactions',
    'type amount category description date accountId createdAt',
    { deletedAt: null },
  ],
  expenses: [
    Transaction,
    'expenses',
    'type amount category description date accountId createdAt',
    { type: 'expense', deletedAt: null },
  ],
  income: [
    Transaction,
    'income',
    'type amount category description date accountId createdAt',
    { type: 'income', deletedAt: null },
  ],
  debts: [
    Debt,
    'debts',
    'personName type originalAmount remainingAmount status dueDate createdAt',
    { archived: false },
  ],
  bills: [Bill, 'bills', 'name amount category dueDate status createdAt'],
  subscriptions: [
    Subscription,
    'subscriptions',
    'name amount currency nextBillingDate status createdAt',
  ],
  goals: [Goal, 'goals', 'title targetAmount currentAmount targetDate status createdAt'],
  projects: [Project, 'projects', 'name status startDate targetDate createdAt'],
  habits: [Habit, 'habits', 'name frequency active createdAt'],
  wishlist: [Wishlist, 'wishlist', 'name expectedPrice priority status createdAt'],
  contacts: [Contact, 'contacts', 'name phone email createdAt'],
  notes: [Note, 'notes', 'title content pinned createdAt'],
  events: [EventSubscription, 'events', 'event status createdAt'],
};

adminSupportRoutes.use(
  adminAuth,
  asyncHandler(async (req, _res, next) => {
    if (req.admin.role !== 'SUPER_ADMIN' || req.admin.status !== 'ACTIVE') {
      await audit('SUPPORT_OPERATION_DENIED', {
        actorType: 'ADMIN',
        actorId: req.admin._id,
        targetType: 'User',
        targetId: id.safeParse(req.body?.userId).success ? req.body.userId : undefined,
        metadata: {
          method: req.method,
          path: req.path.slice(0, 150),
          scope: 'READ_ONLY',
          reason: 'NOT_SUPER_ADMIN',
        },
        ip: req.ip,
      });
      throw new AppError('Super Admin access required', 403, undefined, 'ADMIN_FORBIDDEN');
    }
    next();
  }),
);
adminSupportRoutes.post(
  '/sessions',
  limit,
  requireAdminCsrf,
  validate(
    z.strictObject({
      userId: id,
      reason: z.string().trim().min(10).max(500),
      adminPassword: z.string().min(1),
      confirmed: z.literal(true),
    }),
  ),
  verifyFreshAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.body.userId).select('fullName email status');
    if (!user) throw new AppError('User not found', 404);
    await audit('SUPPORT_SESSION_REQUESTED', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'User',
      targetId: user._id,
      metadata: { scope: 'READ_ONLY', reason: req.body.reason },
      ip: req.ip,
    });
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const dbSession = await mongoose.startSession();
    let session;
    try {
      await dbSession.withTransaction(async () => {
        const previous = await SupportSession.find({ admin: req.admin._id, revokedAt: null })
          .select('_id user')
          .session(dbSession);
        await SupportSession.updateMany(
          { admin: req.admin._id, revokedAt: null },
          { $set: { revokedAt: new Date(), revokedReason: 'REPLACED' } },
          { session: dbSession },
        );
        for (const old of previous)
          await audit('SUPPORT_SESSION_REPLACED', {
            actorType: 'ADMIN',
            actorId: req.admin._id,
            targetType: 'User',
            targetId: old.user,
            metadata: { supportSessionId: String(old._id), scope: 'READ_ONLY' },
            ip: req.ip,
            session: dbSession,
          });
        [session] = await SupportSession.create(
          [
            {
              admin: req.admin._id,
              user: user._id,
              tokenHash: digest(token),
              reason: req.body.reason,
              expiresAt,
            },
          ],
          { session: dbSession },
        );
        await audit('SUPPORT_SESSION_CREATED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: user._id,
          metadata: {
            supportSessionId: String(session._id),
            scope: 'READ_ONLY',
            reason: req.body.reason,
            expiresAt,
          },
          ip: req.ip,
          session: dbSession,
        });
      });
    } finally {
      await dbSession.endSession();
    }
    res.cookie(cookie, token, { ...options, maxAge: 15 * 60_000 });
    return success(
      res,
      {
        user: { id: String(user._id), fullName: user.fullName, email: user.email },
        expiresAt,
        scope: 'READ_ONLY',
      },
      201,
    );
  }),
);

adminSupportRoutes.use(
  asyncHandler(async (req, _res, next) => {
    const token = req.cookies?.[cookie];
    const session = token
      ? await SupportSession.findOne({ tokenHash: digest(token), admin: req.admin._id })
      : null;
    if (!session)
      throw new AppError('Support session required', 401, undefined, 'SUPPORT_SESSION_REQUIRED');
    if (session.revokedAt || session.expiresAt <= new Date()) {
      if (!session.revokedAt) {
        await expireSupportSession(session, req.ip);
      }
      throw new AppError('Support session expired', 401, undefined, 'SUPPORT_SESSION_EXPIRED');
    }
    if (req.params.id && String(session.user) !== req.params.id)
      throw new AppError(
        'Support session target mismatch',
        403,
        undefined,
        'SUPPORT_TARGET_MISMATCH',
      );
    req.supportSession = session;
    next();
  }),
);

adminSupportRoutes.get(
  '/session',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.supportSession.user).select(
      'fullName email status createdAt lastLoginAt',
    );
    if (!user) throw new AppError('User not found', 404);
    await audit('SUPPORT_SESSION_ENTERED', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'User',
      targetId: user._id,
      metadata: { supportSessionId: String(req.supportSession._id), scope: 'READ_ONLY' },
      ip: req.ip,
    });
    return success(res, {
      user: {
        id: String(user._id),
        fullName: user.fullName,
        email: user.email,
        status: user.status,
      },
      expiresAt: req.supportSession.expiresAt,
      scope: 'READ_ONLY',
    });
  }),
);

adminSupportRoutes.get(
  '/workspace/:section',
  asyncHandler(async (req, res) => {
    const section = req.params.section;
    const pageResult = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .safeParse(req.query.page);
    if (!pageResult.success) throw new AppError('Invalid page', 422);
    const page = pageResult.data;
    const user = await User.findById(req.supportSession.user).select(
      'fullName email status createdAt lastLoginAt',
    );
    if (!user) throw new AppError('User not found', 404);
    if (user.status !== 'ACTIVE') throw new AppError('User workspace is suspended', 403, undefined, 'USER_SUSPENDED');
    const entitlements = await resolveUserEntitlements(user, { readOnly: true });
    let data;
    let pagination;
    if (section === 'dashboard') {
      if (!entitlements.decisions.dashboard?.allowed) throw new AppError('Dashboard unavailable for this user', 403, undefined, 'FEATURE_NOT_INCLUDED');
      const counts = {};
      for (const [key, [Model, feature, , filter]] of Object.entries(resources)) {
        if (key === 'expenses' || key === 'income') continue;
        counts[key] = entitlements.decisions[feature]?.allowed
          ? await Model.countDocuments({ user: user._id, ...(filter || {}) })
          : null;
      }
      const summary = await dashboardSummary(user._id);
      if (!entitlements.decisions.accounts?.allowed) {
        summary.accounts = [];
        summary.money.totalBalance = 0;
      }
      if (!entitlements.decisions.income?.allowed) summary.money.income = 0;
      if (!entitlements.decisions.expenses?.allowed) summary.money.expenses = 0;
      summary.money.net = summary.money.income - summary.money.expenses;
      if (!entitlements.decisions.debts?.allowed) summary.debts = { receivable: 0, payable: 0 };
      if (!entitlements.decisions.tasks?.allowed)
        summary.tasks = { open: 0, overdue: 0, dueToday: 0 };
      if (!entitlements.decisions.transactions?.allowed) summary.recentTransactions = [];
      if (!entitlements.decisions.goals?.allowed) summary.goals = [];
      summary.upcoming = summary.upcoming.filter(
        (row) => entitlements.decisions[row.kind === 'bill' ? 'bills' : 'subscriptions']?.allowed,
      );
      data = {
        counts,
        plan: entitlements.effectivePlan,
        money: summary.money,
        debts: summary.debts,
        tasks: summary.tasks,
        upcoming: summary.upcoming.length,
      };
    } else if (section === 'settings') {
      const [setting, telegram] = await Promise.all([
        Setting.findOne({ user: user._id })
          .select('language timezone currency theme createdAt')
          .lean(),
        TelegramConnection.findOne({ user: user._id })
          .select('telegramUsername linkedAt lastInteractionAt')
          .lean(),
      ]);
      data = {
        setting,
        telegram: telegram
          ? {
              username: telegram.telegramUsername,
              linkedAt: telegram.linkedAt,
              lastInteractionAt: telegram.lastInteractionAt,
            }
          : null,
      };
    } else {
      const definition = resources[section];
      if (!definition) throw new AppError('Section unavailable', 404);
      const [Model, feature, projection, filter] = definition;
      if (!entitlements.decisions[feature]?.allowed)
        throw new AppError(
          'Feature unavailable for this user',
          403,
          undefined,
          'FEATURE_NOT_INCLUDED',
        );
      const query = { user: user._id, ...(filter || {}) };
      const total = await Model.countDocuments(query);
      if (section === 'accounts')
        data = (await accountBalances(user._id, { archived: false }))
          .slice((page - 1) * 100, page * 100)
          .map(({ _id, name, type, currency, currentBalance, archived, createdAt }) => ({
            _id,
            name,
            type,
            currency,
            currentBalance,
            archived,
            createdAt,
          }));
      else {
        const lookup = Model.find(query)
          .select(projection)
          .sort({ createdAt: -1 })
          .skip((page - 1) * 100)
          .limit(100);
        if (section === 'events') lookup.populate('event', 'title startsAt venue');
        data = await lookup.lean();
      }
      pagination = { page, pages: Math.max(1, Math.ceil(total / 100)), total };
    }
    await audit('SUPPORT_RESOURCE_READ', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'User',
      targetId: user._id,
      metadata: { supportSessionId: String(req.supportSession._id), scope: 'READ_ONLY', section },
      ip: req.ip,
    });
    return success(res, {
      section,
      data,
      pagination,
      user: { id: String(user._id), fullName: user.fullName },
      expiresAt: req.supportSession.expiresAt,
    });
  }),
);

adminSupportRoutes.post(
  '/exit',
  requireAdminCsrf,
  asyncHandler(async (req, res) => {
    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await SupportSession.updateOne(
          { _id: req.supportSession._id, revokedAt: null },
          { $set: { revokedAt: new Date(), revokedReason: 'EXIT' } },
          { session: dbSession },
        );
        await audit('SUPPORT_SESSION_EXITED', {
          actorType: 'ADMIN',
          actorId: req.admin._id,
          targetType: 'User',
          targetId: req.supportSession.user,
          metadata: { supportSessionId: String(req.supportSession._id), scope: 'READ_ONLY' },
          ip: req.ip,
          session: dbSession,
        });
      });
    } finally {
      await dbSession.endSession();
    }
    res.clearCookie(cookie, options);
    return success(res, { exited: true });
  }),
);

adminSupportRoutes.use(
  asyncHandler(async (req) => {
    await audit('SUPPORT_OPERATION_DENIED', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'User',
      targetId: req.supportSession.user,
      metadata: {
        supportSessionId: String(req.supportSession._id),
        method: req.method,
        path: req.path.slice(0, 150),
        scope: 'READ_ONLY',
      },
      ip: req.ip,
    });
    throw new AppError('Support Mode is read-only', 405, undefined, 'SUPPORT_READ_ONLY');
  }),
);
