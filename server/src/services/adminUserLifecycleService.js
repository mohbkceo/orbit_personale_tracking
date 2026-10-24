import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { ActivationLink } from '../models/ActivationLink.js';
import { AuthSession } from '../models/AuthSession.js';
import { SupportSession } from '../models/SupportSession.js';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { AdminSupportNote } from '../models/AdminSupportNote.js';
import { UserFeatureOverride } from '../models/UserFeatureOverride.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { TelegramLinkToken } from '../models/TelegramLinkToken.js';
import { TelegramSession } from '../models/TelegramSession.js';
import { TelegramInteraction } from '../models/TelegramInteraction.js';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Reminder } from '../models/Reminder.js';
import { ReminderEvent } from '../models/ReminderEvent.js';
import { Bill, Subscription, Goal } from '../models/Planning.js';
import { Contact, Project, Note, Habit, Wishlist } from '../models/Personal.js';
import { Setting } from '../models/Setting.js';
import { Activity } from '../models/Activity.js';
import { DailyFocus } from '../models/DailyFocus.js';
import { TaskExecutionEvent } from '../models/TaskExecutionEvent.js';
import { TaskDigestDelivery } from '../models/TaskDigestDelivery.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { EventDiscoveryDelivery } from '../models/EventDiscoveryDelivery.js';
import { AdvertisingConsent } from '../models/AdvertisingConsent.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { AnalyticsSession } from '../models/AnalyticsSession.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { AnalyticsLead } from '../models/AnalyticsLead.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';

// PaymentOrder, AccessSubscription, ActivationLink and AuditLog are retained as
// financial/access and accountability records. No user workspace collection is.
export const workspaceModels = [
  Account,
  Transaction,
  Debt,
  Task,
  Reminder,
  ReminderEvent,
  Bill,
  Subscription,
  Goal,
  Contact,
  Project,
  Note,
  Habit,
  Wishlist,
  Setting,
  Activity,
  DailyFocus,
  TaskExecutionEvent,
  TaskDigestDelivery,
  EventSubscription,
  EventDiscoveryDelivery,
  AdvertisingConsent,
  AnalyticsVisitor,
  AnalyticsSession,
  AnalyticsEvent,
  AnalyticsLead,
  AuthSession,
  AccountActionToken,
  AdminSupportNote,
  UserFeatureOverride,
  TelegramConnection,
  TelegramLinkToken,
  TelegramInteraction,
];

export async function deleteUserAccount(userId, adminId, reason, ip, expectedEmail) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).select('email').session(session);
      if (!user) throw new AppError('User not found', 404);
      if (expectedEmail && user.email !== expectedEmail.trim().toLowerCase())
        throw new AppError('Confirmation email does not match', 422);
      // Serialize against payment confirmation, activation, manual grants and
      // account status changes, all of which write the User document.
      await User.updateOne({ _id: userId }, { $inc: { authVersion: 1 } }, { session });
      if (
        await PaymentOrder.exists({
          user: userId,
          state: { $in: ['PENDING', 'PROCESSING'] },
        }).session(session)
      )
        throw new AppError('Resolve the unfinished payment before deleting this user', 409);

      const connection = await TelegramConnection.findOne({ user: userId })
        .select('telegramUserId')
        .session(session);
      const paymentCount = await PaymentOrder.countDocuments({ user: userId }).session(session);
      await SupportSession.updateMany(
        { user: userId, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'USER_DELETED' } },
        { session },
      );
      await ActivationLink.updateMany(
        {
          status: 'ACTIVE',
          $or: [{ intendedUser: userId }, { reservedByUser: userId }],
        },
        { $set: { status: 'REVOKED' } },
        { session },
      );
      await AccessSubscription.updateMany(
        { user: userId, status: 'ACTIVE' },
        { $set: { status: 'REVOKED' } },
        { session },
      );
      // Keep monetary facts while dropping checkout URLs and attribution data.
      await PaymentOrder.updateMany(
        { user: userId },
        { $unset: { paymentUrl: 1, analytics: 1, advertising: 1, openKey: 1 } },
        { session },
      );
      if (connection)
        await TelegramSession.deleteMany(
          { telegramUserId: connection.telegramUserId },
          { session },
        );
      for (const Model of workspaceModels) await Model.deleteMany({ user: userId }, { session });
      const removed = await User.deleteOne({ _id: userId }, { session });
      if (removed.deletedCount !== 1) throw new AppError('User not found', 404);
      await audit('ADMIN_USER_DELETED', {
        actorType: 'ADMIN',
        actorId: adminId,
        targetType: 'User',
        targetId: userId,
        metadata: { reason, paymentRecordsRetained: paymentCount, scope: 'ACCOUNT_AND_WORKSPACE' },
        ip,
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  return { id: String(userId), deleted: true };
}

export async function applyBulkUserAction(ids, action, adminId, reason, ip) {
  const session = await mongoose.startSession();
  const status = action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
  const results = [];
  try {
    await session.withTransaction(async () => {
      const users = await User.find({ _id: { $in: ids } }).select('_id status').session(session);
      if (users.length !== ids.length) throw new AppError('One or more users no longer exist', 409);
      const byId = new Map(users.map((user) => [String(user._id), user]));
      for (const id of ids) {
        const user = byId.get(id);
        if (action !== 'REVOKE_SESSIONS' && user.status === status) {
          results.push({ id, changed: false });
          continue;
        }
        await User.updateOne(
          { _id: id },
          {
            ...(action === 'REVOKE_SESSIONS' ? {} : { $set: { status } }),
            $inc: { authVersion: 1 },
          },
          { session },
        );
        await AuthSession.updateMany(
          { user: id, revokedAt: null },
          { $set: { revokedAt: new Date() } },
          { session },
        );
        if (action === 'SUSPEND')
          await SupportSession.updateMany(
            { user: id, revokedAt: null },
            { $set: { revokedAt: new Date(), revokedReason: 'USER_SUSPENDED' } },
            { session },
          );
        await audit(
          action === 'REVOKE_SESSIONS'
            ? 'ADMIN_USER_SESSIONS_REVOKED'
            : action === 'SUSPEND'
              ? 'USER_SUSPENDED'
              : 'USER_UNSUSPENDED',
          {
            actorType: 'ADMIN',
            actorId: adminId,
            targetType: 'User',
            targetId: id,
            metadata: { reason, bulk: true, ...(action === 'REVOKE_SESSIONS' ? { all: true } : {}) },
            ip,
            session,
          },
        );
        results.push({ id, changed: true });
      }
    });
  } finally {
    await session.endSession();
  }
  return results;
}
