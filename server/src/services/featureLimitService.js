import crypto from 'node:crypto';
import { FeatureQuotaLock } from '../models/FeatureQuotaLock.js';
import { assertFeature } from './entitlementService.js';
import { AppError } from '../utils/AppError.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Personal.js';
import { Account } from '../models/Account.js';
import { Reminder } from '../models/Reminder.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const usage = {
  'active-tasks-limit': [Task, { archived: false, status: { $in: ['todo', 'in_progress'] } }],
  tasks: [Task, { archived: false, status: { $in: ['todo', 'in_progress'] } }],
  'projects-limit': [Project, {}],
  'accounts-limit': [Account, { archived: false }],
  'reminders-limit': [Reminder, { archived: false, source: 'custom', status: { $in: ['scheduled', 'active', 'snoozed', 'waiting'] } }],
};

export async function featureUsage(userId, decisions) {
  return Object.fromEntries(await Promise.all(Object.entries(usage).map(async ([key, [Model, filter]]) => {
    const decision = decisions[key];
    if (!decision?.allowed || decision.limit == null) return [key, { used: null, remaining: null }];
    const used = await Model.countDocuments({ user: userId, ...filter });
    return [key, { used, remaining: Math.max(0, decision.limit - used) }];
  })));
}

// A per-user, per-capability database lock serializes count + insert across
// web, bot and worker processes. It is released after the write completes.
export async function withFeatureLimit(userId, key, Model, filter, create) {
  const decision = await assertFeature(userId, key);
  const legacyTask = key === 'active-tasks-limit' ? await assertFeature(userId, 'tasks') : null;
  const limits = [decision.limit, legacyTask?.limit].filter((value) => Number.isInteger(value));
  const limit = limits.length ? Math.min(...limits) : null;
  if (limit == null) return create();
  const lockId = `${userId}:${key}`;
  const token = crypto.randomUUID();
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const now = new Date();
    try {
      const lock = await FeatureQuotaLock.findOneAndUpdate(
        { _id: lockId, lockedUntil: { $lte: now } },
        { $set: { token, lockedUntil: new Date(now.getTime() + 60_000) } },
        { upsert: true, new: true },
      );
      if (lock?.token === token) { acquired = true; break; }
    } catch (error) { if (error.code !== 11000) throw error; }
    await delay(25);
  }
  if (!acquired) throw new AppError('This feature is busy. Please try again.', 503, undefined, 'FEATURE_LIMIT_BUSY');
  try {
    const used = await Model.countDocuments({ user: userId, ...filter });
    if (used >= limit) {
      const error = new AppError('Your plan limit has been reached.', 409, undefined, 'FEATURE_LIMIT_EXCEEDED');
      error.feature = key;
      error.upgradePlan = decision.presentation.recommendedPlan?.slug;
      throw error;
    }
    return await create();
  } finally {
    await FeatureQuotaLock.updateOne({ _id: lockId, token }, { $set: { lockedUntil: new Date(0) } });
  }
}
