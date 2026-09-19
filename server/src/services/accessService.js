import { AccessSubscription } from '../models/AccessSubscription.js';
import { audit } from './auditService.js';

export function addDuration(base, value, unit) {
  const date = new Date(base);
  if (!Number.isInteger(value) || value < 1 || !Number.isFinite(date.getTime())) throw new Error('Invalid access duration');
  if (unit === 'HOUR') return new Date(date.getTime() + value * 60 * 60 * 1000);
  if (unit === 'DAY') return new Date(date.getTime() + value * 24 * 60 * 60 * 1000);
  if (unit === 'WEEK') return new Date(date.getTime() + value * 7 * 24 * 60 * 60 * 1000);
  if (!['MONTH', 'YEAR'].includes(unit)) throw new Error('Invalid access duration unit');
  const months = value * (unit === 'YEAR' ? 12 : 1);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

export async function currentSubscription(userId, session) {
  return AccessSubscription.findOne({ user: userId }).sort({ expiresAt: -1, createdAt: -1 }).session(session || null);
}

export async function checkAccess(user, { now = new Date() } = {}) {
  const subscription = await currentSubscription(user._id);
  if (user.status !== 'ACTIVE') return { eligible: false, reason: 'SUSPENDED', subscription };
  if (!subscription) return { eligible: false, reason: 'NO_ACCESS', subscription: null };
  if (subscription.expiresAt <= now) {
    const changed = await AccessSubscription.updateMany({ user: user._id, status: 'ACTIVE', expiresAt: { $lte: now } }, { $set: { status: 'EXPIRED' } });
    if (changed.modifiedCount) await audit('ACCESS_EXPIRED', { actorType: 'SYSTEM', targetType: 'User', targetId: user._id });
    return { eligible: false, reason: 'EXPIRED', subscription };
  }
  return { eligible: true, reason: null, subscription };
}
