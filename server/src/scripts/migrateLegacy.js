import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { Admin } from '../models/Admin.js';
import { Plan } from '../models/Plan.js';
import { ActivationLink } from '../models/ActivationLink.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { Bill, Subscription, Goal } from '../models/Planning.js';
import { Contact, Project, Note, Habit, Wishlist } from '../models/Personal.js';
import { Setting } from '../models/Setting.js';
import { hashPassword, normalizeEmail } from '../services/authService.js';
import { addDuration } from '../services/accessService.js';
import { bootstrapSuperAdmin } from './bootstrapAdmin.js';

const personalModels = [Account, Transaction, Debt, Task, Activity, Bill, Subscription, Goal, Contact, Project, Note, Habit, Wishlist, Setting];

export async function migrateLegacy() {
  const { ORBIT_OWNER_EMAIL, ORBIT_OWNER_NAME, ORBIT_OWNER_INITIAL_PASSWORD } = process.env;
  if (!ORBIT_OWNER_EMAIL || !ORBIT_OWNER_NAME || !ORBIT_OWNER_INITIAL_PASSWORD || ORBIT_OWNER_INITIAL_PASSWORD.length < 12) throw new Error('Set ORBIT_OWNER_EMAIL, ORBIT_OWNER_NAME, and an ORBIT_OWNER_INITIAL_PASSWORD of at least 12 characters.');
  const unownedSettings = await Setting.collection.countDocuments({ user: { $exists: false } });
  if (unownedSettings > 1) throw new Error('Multiple legacy Settings documents found; resolve ownership manually before migration.');
  const legacySetting = await Setting.collection.findOne({ user: { $exists: false } });
  const legacyIds = legacySetting?.telegram?.allowedTelegramUserIds || [];
  if (legacyIds.length > 1) throw new Error('Multiple legacy Telegram UIDs found; resolve them before migration so no connection is lost.');
  if (legacySetting?.telegram?.encryptedBotToken && !process.env.ORBIT_TELEGRAM_BOT_TOKEN) throw new Error('Set ORBIT_TELEGRAM_BOT_TOKEN before migrating a legacy configured bot. The old encrypted token will not be exported.');
  if (legacyIds.length === 1) {
    const claimed = await TelegramConnection.findOne({ telegramUserId: String(legacyIds[0]) });
    const priorOwner = await User.findOne({ email: normalizeEmail(ORBIT_OWNER_EMAIL) });
    if (claimed && String(claimed.user) !== String(priorOwner?._id)) throw new Error('Legacy Telegram UID is already linked to another Orbit user; resolve manually before migration.');
  }
  const admin = await bootstrapSuperAdmin();
  const email = normalizeEmail(ORBIT_OWNER_EMAIL);
  let owner = await User.findOne({ email });
  if (!owner) owner = await User.create({ email, fullName: ORBIT_OWNER_NAME, passwordHash: await hashPassword(ORBIT_OWNER_INITIAL_PASSWORD), onboardingCompletedAt: new Date() });
  const counts = {};
  for (const Model of personalModels) {
    const result = await Model.collection.updateMany({ user: { $exists: false } }, { $set: { user: owner._id } });
    counts[Model.modelName] = result.modifiedCount;
    const orphanCount = await Model.collection.countDocuments({ user: { $exists: false } });
    if (orphanCount) throw new Error(`${Model.modelName} still has ${orphanCount} records without an owner.`);
  }
  const indexes = await Setting.collection.indexes();
  if (indexes.some((index) => index.name === 'singletonKey_1')) await Setting.collection.dropIndex('singletonKey_1');
  if (legacyIds.length === 1 && !(await TelegramConnection.exists({ user: owner._id }))) {
    const telegramUserId = String(legacyIds[0]);
    await TelegramConnection.create({ user: owner._id, telegramUserId, chatId: telegramUserId, linkedAt: new Date() });
  }
  await Setting.collection.updateMany({ user: owner._id }, { $unset: { singletonKey: '', 'telegram.enabled': '', 'telegram.encryptedBotToken': '', 'telegram.iv': '', 'telegram.authTag': '', 'telegram.allowedTelegramUserIds': '', 'telegram.webhookUrl': '', 'telegram.lastUpdateAt': '' } });
  const days = Number(process.env.ORBIT_OWNER_ACCESS_DAYS || 365);
  if (!Number.isInteger(days) || days < 1 || days > 36500) throw new Error('ORBIT_OWNER_ACCESS_DAYS must be 1–36500.');
  if (!(await AccessSubscription.exists({ user: owner._id }))) {
    let plan = await Plan.findOne({ name: 'Legacy Owner Access', createdBy: admin._id });
    if (!plan) plan = await Plan.create({ name: 'Legacy Owner Access', durationValue: days, durationUnit: 'DAY', description: 'One-time migration grant', status: 'INACTIVE', createdBy: admin._id });
    const tokenHash = crypto.createHash('sha256').update(`legacy-owner:${owner._id}`).digest('hex');
    let link = await ActivationLink.findOne({ tokenHash });
    if (!link) link = await ActivationLink.create({ tokenHash, plan: plan._id, planSnapshot: { name: plan.name, durationValue: days, durationUnit: 'DAY' }, status: 'USED', createdByAdmin: admin._id, activatedAt: new Date(), activatedUser: owner._id, note: 'Legacy owner migration' });
    if (!(await AccessSubscription.exists({ activationLink: link._id }))) {
      const now = new Date();
      await AccessSubscription.create({ user: owner._id, plan: plan._id, activationLink: link._id, startedAt: now, activatedAt: now, expiresAt: addDuration(now, days, 'DAY'), planSnapshot: { name: plan.name, durationValue: days, durationUnit: 'DAY' } });
    }
  }
  for (const Model of personalModels) await Model.createIndexes();
  await Promise.all([User.createIndexes(), Admin.createIndexes(), Plan.createIndexes(), ActivationLink.createIndexes(), AccessSubscription.createIndexes(), TelegramConnection.createIndexes()]);
  return { owner: email, assigned: counts, telegram: legacyIds.length === 1 ? 'converted' : 'none' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await connectDatabase();
    console.log(JSON.stringify(await migrateLegacy(), null, 2));
  } finally { await disconnectDatabase(); }
}
