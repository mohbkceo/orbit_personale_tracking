import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { ActivationLink } from '../models/ActivationLink.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { Plan } from '../models/Plan.js';
import { User } from '../models/User.js';
import { Setting } from '../models/Setting.js';
import { addDuration, currentSubscription } from './accessService.js';
import { audit } from './auditService.js';
import { hashPassword, normalizeEmail } from './authService.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const makeToken = () => crypto.randomBytes(32).toString('base64url');

function linkError(link, now = new Date()) {
  if (!link) return new AppError('This Activation Link is invalid.', 404, undefined, 'ACTIVATION_INVALID');
  if (link.status === 'USED') return new AppError('This Activation Link has already been used.', 409, undefined, 'ACTIVATION_USED');
  if (link.status === 'REVOKED') return new AppError('This Activation Link has been revoked.', 410, undefined, 'ACTIVATION_REVOKED');
  if (link.status === 'EXPIRED' || (link.expiresAt && link.expiresAt <= now)) return new AppError('This Activation Link has expired.', 410, undefined, 'ACTIVATION_EXPIRED');
  if (!link.plan) return new AppError('This Activation Link is invalid.', 404, undefined, 'ACTIVATION_INVALID');
  return null;
}

export async function findValidLink(key, { session, countOpen = false } = {}) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(String(key))) throw linkError(null);
  const link = await ActivationLink.findOne({ tokenHash: hashToken(key) }).populate('plan').session(session || null);
  const error = linkError(link);
  if (error) {
    if (link?.status === 'ACTIVE' && link.expiresAt && link.expiresAt <= new Date() && !session) await ActivationLink.updateOne({ _id: link._id, status: 'ACTIVE' }, { $set: { status: 'EXPIRED' } });
    throw error;
  }
  if (countOpen) await ActivationLink.updateOne({ _id: link._id }, { $inc: { openCount: 1 }, $set: { lastOpenedAt: new Date() }, $min: { firstOpenedAt: new Date() } });
  return link;
}

export async function createActivationLink(planId, adminId, { validityDays = 7, note = '', intendedUser, qrBatch, batchSequence, batchCode, session, planDocument } = {}) {
  if (!mongoose.isValidObjectId(planId)) throw new AppError('Invalid plan', 422);
  if (intendedUser && (!mongoose.isValidObjectId(intendedUser) || !(await User.exists({ _id: intendedUser }).session(session || null)))) throw new AppError('User not found', 404);
  const plan = planDocument || await Plan.findOne({ _id: planId, status: 'ACTIVE' }).session(session || null);
  if (!plan) throw new AppError('The plan is inactive or unavailable.', 409, undefined, 'PLAN_INACTIVE');
  const token = makeToken();
  const encrypted = encryptSecret(token);
  const [link] = await ActivationLink.create([{ tokenHash: hashToken(token), encryptedToken: encrypted.encrypted, tokenIv: encrypted.iv, tokenAuthTag: encrypted.authTag, plan: plan._id, planSnapshot: { name: plan.name, durationValue: plan.durationValue, durationUnit: plan.durationUnit }, createdByAdmin: adminId, expiresAt: new Date(Date.now() + validityDays * 86400000), note, intendedUser, qrBatch, batchSequence, batchCode }], session ? { session } : {});
  await audit('ACTIVATION_LINK_CREATED', { actorType: 'ADMIN', actorId: adminId, targetType: 'ActivationLink', targetId: link._id, metadata: { planId: String(plan._id), ...(qrBatch ? { qrBatch: String(qrBatch) } : {}) }, session });
  return { link: { _id: link._id, plan: link.plan, planSnapshot: link.planSnapshot, status: link.status, expiresAt: link.expiresAt, note: link.note, intendedUser: link.intendedUser, qrBatch: link.qrBatch, batchSequence: link.batchSequence, batchCode: link.batchCode, createdAt: link.createdAt }, url: `${env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '')}/activate/${token}` };
}

export function activationUrlFromLink(link) {
  if (!link || link.status !== 'ACTIVE' || (link.expiresAt && link.expiresAt <= new Date())) throw new AppError('Active Activation Link not found', 404);
  if (!link.encryptedToken) throw new AppError('This legacy link cannot be copied; create a new link.', 409);
  const token = decryptSecret({ encrypted: link.encryptedToken, iv: link.tokenIv, authTag: link.tokenAuthTag });
  return `${env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '')}/activate/${token}`;
}

export async function activationUrl(linkId) {
  const link = await ActivationLink.findById(linkId).select('+encryptedToken +tokenIv +tokenAuthTag');
  return activationUrlFromLink(link);
}

export async function registerWithLink(key, input) {
  const session = await mongoose.startSession();
  let user;
  try {
    await session.withTransaction(async () => {
      const link = await findValidLink(key, { session });
      if (link.intendedUser) throw new AppError('This renewal link requires the existing account to sign in.', 403, undefined, 'ACTIVATION_ACCOUNT_REQUIRED');
      if (link.reservedByUser) throw new AppError('This Activation Link is already reserved.', 409, undefined, 'ACTIVATION_USED');
      const email = normalizeEmail(input.email);
      if (await User.exists({ email }).session(session)) throw new AppError('An Orbit account already exists. Sign in to activate this access.', 409, undefined, 'ACCOUNT_EXISTS');
      [user] = await User.create([{ fullName: input.fullName, email, passwordHash: await hashPassword(input.password) }], { session });
      const claimed = await ActivationLink.updateOne({ _id: link._id, status: 'ACTIVE', reservedByUser: null }, { $set: { reservedByUser: user._id } }, { session });
      if (claimed.modifiedCount !== 1) throw new AppError('This Activation Link is already reserved.', 409, undefined, 'ACTIVATION_USED');
      await Setting.create([{ user: user._id, ...(input.preferences || {}) }], { session });
      await audit('USER_CREATED', { actorType: 'USER', actorId: user._id, targetType: 'User', targetId: user._id, session });
    });
  } finally { await session.endSession(); }
  return user;
}

export async function activateLink(key, user) {
  if (user.status !== 'ACTIVE') throw new AppError('Your Orbit account is suspended.', 403, undefined, 'USER_SUSPENDED');
  const session = await mongoose.startSession();
  let grant;
  try {
    await session.withTransaction(async () => {
      const link = await findValidLink(key, { session });
      if (link.intendedUser && String(link.intendedUser) !== String(user._id)) throw new AppError('This Activation Link is for another account.', 403, undefined, 'ACTIVATION_INVALID');
      if (link.reservedByUser && String(link.reservedByUser) !== String(user._id)) throw new AppError('This Activation Link is reserved for another account.', 403, undefined, 'ACTIVATION_INVALID');
      const lock = await User.updateOne({ _id: user._id, status: 'ACTIVE' }, { $inc: { accessVersion: 1 } }, { session });
      if (lock.modifiedCount !== 1) throw new AppError('Your Orbit account is suspended.', 403, undefined, 'USER_SUSPENDED');
      const now = new Date();
      const previous = await currentSubscription(user._id, session);
      const base = previous?.expiresAt > now ? previous.expiresAt : now;
      const plan = await Plan.findById(link.plan._id).populate('features.feature', 'key type').session(session);
      if (!plan) throw new AppError('Plan unavailable', 409, undefined, 'PLAN_INACTIVE');
      const expiresAt = addDuration(base, plan.durationValue, plan.durationUnit);
      const used = await ActivationLink.updateOne({ _id: link._id, status: 'ACTIVE', $or: [{ reservedByUser: user._id }, { reservedByUser: null }] }, { $set: { status: 'USED', activatedUser: user._id, activatedAt: now } }, { session });
      if (used.modifiedCount !== 1) throw new AppError('This Activation Link has already been used.', 409, undefined, 'ACTIVATION_USED');
      const features = (plan.features || []).filter((entry) => entry.feature).map((entry) => ({
        key: entry.feature.key, type: entry.feature.type, enabled: entry.enabled,
        ...(entry.feature.type === 'LIMIT' ? { limit: entry.limit } : {}),
        ...(entry.feature.type === 'TEXT' ? { value: entry.value } : {}),
      }));
      [grant] = await AccessSubscription.create([{ user: user._id, plan: plan._id, activationLink: link._id, startedAt: base, activatedAt: now, expiresAt, planSnapshot: { name: plan.name, durationValue: plan.durationValue, durationUnit: plan.durationUnit, features } }], { session });
      await User.updateOne({ _id: user._id, onboardingCompletedAt: null }, { $set: { onboardingCompletedAt: now } }, { session });
      await audit('ACTIVATION_LINK_USED', { actorType: 'USER', actorId: user._id, targetType: 'ActivationLink', targetId: link._id, session });
      await audit('ACCESS_ACTIVATED', { actorType: 'USER', actorId: user._id, targetType: 'AccessSubscription', targetId: grant._id, metadata: { expiresAt }, session });
    });
  } finally { await session.endSession(); }
  return grant;
}
