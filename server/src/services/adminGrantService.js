import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Plan } from '../models/Plan.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { currentSubscription, addDuration } from './accessService.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';

const fingerprint = (value) =>
  crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function createAdminGrant(userId, adminId, input, ip) {
  const key = `${userId}:${input.idempotencyKey}`;
  const signature = fingerprint({
    mode: input.mode,
    planId: input.planId,
    durationDays: input.durationDays,
    grantKind: input.grantKind,
    paymentReference: input.paymentReference || '',
    reason: input.reason,
  });
  const existing = await AccessSubscription.findOne({ idempotencyKey: key });
  if (existing) {
    if (existing.requestFingerprint !== signature)
      throw new AppError('Idempotency key reused for a different grant', 409);
    return existing;
  }
  const session = await mongoose.startSession();
  let grant;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new AppError('User not found', 404);
      // This write serializes subscription changes for a single account.
      await User.updateOne({ _id: userId }, { $inc: { accessVersion: 1 } }, { session });
      const previous = await currentSubscription(userId, session);
      if (input.mode === 'EXTEND' && (!previous || previous.expiresAt <= new Date()))
        throw new AppError('An active subscription is required to extend', 409);
      const planId = input.mode === 'EXTEND' ? previous.plan : input.planId;
      const plan = await Plan.findOne({ _id: planId, kind: 'PAID', status: 'ACTIVE' })
        .populate('features.feature', 'key type')
        .session(session);
      if (!plan) throw new AppError('Select an active paid plan', 422);
      const now = new Date();
      const base = previous?.expiresAt > now ? previous.expiresAt : now;
      const durationValue = input.mode === 'EXTEND' ? input.durationDays : plan.durationValue;
      const durationUnit = input.mode === 'EXTEND' ? 'DAY' : plan.durationUnit;
      if (previous?.expiresAt?.getUTCFullYear() >= 9999 && input.mode === 'EXTEND')
        throw new AppError('Permanent access cannot be extended', 409);
      const expiresAt =
        durationUnit === 'PERMANENT'
          ? new Date('9999-12-31T23:59:59.999Z')
          : addDuration(base, durationValue, durationUnit);
      const features = (plan.features || [])
        .filter((entry) => entry.feature)
        .map((entry) => ({
          key: entry.feature.key,
          type: entry.feature.type,
          enabled: entry.enabled,
          ...(entry.feature.type === 'LIMIT' ? { limit: entry.limit } : {}),
          ...(entry.feature.type === 'TEXT' ? { value: entry.value } : {}),
        }));
      [grant] = await AccessSubscription.create(
        [
          {
            user: userId,
            plan: plan._id,
            source: 'ADMIN_GRANT',
            grantKind: input.grantKind,
            paymentReference: input.paymentReference || undefined,
            grantReason: input.reason,
            grantedBy: adminId,
            idempotencyKey: key,
            requestFingerprint: signature,
            startedAt: now,
            activatedAt: now,
            expiresAt,
            entitlementVersion: 1,
            planSnapshot: { name: plan.name, durationValue, durationUnit, features },
          },
        ],
        { session },
      );
      await audit('ADMIN_ACCESS_GRANTED', {
        actorType: 'ADMIN',
        actorId: adminId,
        targetType: 'AccessSubscription',
        targetId: grant._id,
        metadata: {
          userId: String(userId),
          mode: input.mode,
          grantKind: input.grantKind,
          planId: String(plan._id),
          expiresAt,
          reason: input.reason,
          paymentReference: input.paymentReference || null,
          policy: 'SWITCH_NOW_PRESERVE_REMAINING_TIME',
        },
        ip,
        session,
      });
    });
  } catch (error) {
    if (error.code === 11000) {
      const previous = await AccessSubscription.findOne({ idempotencyKey: key });
      if (previous?.requestFingerprint === signature) return previous;
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return grant;
}

export async function revokeAdminGrant(userId, grantId, adminId, reason, ip) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await User.updateOne({ _id: userId }, { $inc: { accessVersion: 1 } }, { session });
      const grant = await AccessSubscription.findOne({
        _id: grantId,
        user: userId,
        source: 'ADMIN_GRANT',
        status: 'ACTIVE',
      }).session(session);
      if (!grant) throw new AppError('Eligible manual grant not found', 404);
      if (
        await AccessSubscription.exists({
          user: userId,
          activatedAt: { $gt: grant.activatedAt },
        }).session(session)
      )
        throw new AppError('Only the latest grant can be revoked safely', 409);
      await AccessSubscription.updateOne(
        { _id: grantId, status: 'ACTIVE' },
        { $set: { status: 'REVOKED' } },
        { session },
      );
      await audit('ADMIN_ACCESS_REVOKED', {
        actorType: 'ADMIN',
        actorId: adminId,
        targetType: 'AccessSubscription',
        targetId: grant._id,
        metadata: { userId: String(userId), reason },
        ip,
        session,
      });
    });
  } finally {
    await session.endSession();
  }
}
