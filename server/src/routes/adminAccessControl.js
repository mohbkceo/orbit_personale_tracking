import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { AccessConfiguration } from '../models/AccessConfiguration.js';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { invalidateEntitlementCache } from '../services/entitlementService.js';

export const adminAccessControlRoutes = Router();
adminAccessControlRoutes.use(adminAuth, adminRoleGuard('SUPER_ADMIN'));
const id = z.string().regex(/^[a-f\d]{24}$/i);
const featureKey = z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(100);
const planAssignment = z.strictObject({ planId: id, enabled: z.boolean(), limit: z.number().int().min(0).nullable().optional(), value: z.string().trim().max(240).optional() });
const bulkItem = z.strictObject({ key: featureKey, limit: z.number().int().min(0).nullable().optional(), value: z.string().trim().max(240).optional() });
const bulkPatch = z.strictObject({
  planId: id, features: z.array(bulkItem).min(1).max(50), operation: z.enum(['GRANT', 'REMOVE']),
  exclusive: z.boolean().default(false), applyExisting: z.boolean().default(false),
});
const patch = z.strictObject({
  accessMode: z.enum(['FREE', 'PLAN_BASED', 'DISABLED']).optional(),
  scope: z.enum(['SECTION', 'CAPABILITY']).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  order: z.number().int().min(0).optional(),
  publicVisible: z.boolean().optional(),
  locked: z.strictObject({
    title: z.string().trim().max(120).optional(), description: z.string().trim().max(500).optional(),
    explanation: z.string().trim().max(500).optional(), presentation: z.enum(['BLUR', 'PLACEHOLDER', 'INFORMATION']).optional(),
    ctaLabel: z.string().trim().max(80).optional(), recommendedPlan: id.nullable().optional(),
    visibleWhenLocked: z.boolean().optional(),
  }).optional(),
  plans: z.array(planAssignment).optional(),
  applyExisting: z.boolean().optional(),
});

function validateAssignment(feature, item) {
  if (feature.type === 'LIMIT' && item.enabled && item.limit == null) throw new AppError('Enabled limits require a numeric value. Zero means no new items.', 422);
  if (feature.type !== 'LIMIT' && item.limit != null) throw new AppError('This feature does not accept a limit.', 422);
  if (feature.type === 'TEXT' && item.enabled && !item.value) throw new AppError('Enabled text features require a value.', 422);
  if (feature.type !== 'TEXT' && item.value) throw new AppError('This feature does not accept a text value.', 422);
}

async function writePlanAssignment(planId, feature, item, session) {
  // Update only the feature array. Saving a legacy Plan document can generate
  // a missing slug and collide with another existing paid plan.
  await Plan.updateOne({ _id: planId }, { $pull: { features: { feature: feature._id } } }, { session });
  if (item.enabled) await Plan.updateOne({ _id: planId }, { $push: { features: { feature: feature._id, enabled: true,
    ...(feature.type === 'LIMIT' ? { limit: item.limit } : {}), ...(feature.type === 'TEXT' ? { value: item.value } : {}) } } }, { session });
}

async function writeSubscriberOverride(plan, feature, item, session) {
  if (plan.kind === 'FREE' || plan.slug === 'free') return;
  const filter = { plan: plan._id, status: 'ACTIVE', expiresAt: { $gt: new Date() } };
  await AccessSubscription.updateMany(filter, { $pull: { entitlementOverrides: { key: feature.key } } }, { session });
  await AccessSubscription.updateMany(filter, { $push: { entitlementOverrides: { key: feature.key, enabled: item.enabled,
    ...(feature.type === 'LIMIT' ? { limit: item.limit } : {}), ...(feature.type === 'TEXT' ? { value: item.value } : {}) } } }, { session });
}

adminAccessControlRoutes.get('/', asyncHandler(async (_req, res) => {
  const [features, plans, config] = await Promise.all([
    Feature.find().sort({ category: 1, order: 1, name: 1 }).lean(), Plan.find().select('name slug kind status features public').sort({ 'public.order': 1 }).lean(),
    AccessConfiguration.findOne({ key: 'global' }).lean(),
  ]);
  return success(res, { features, plans, configurationVersion: config?.version || 1 });
}));

adminAccessControlRoutes.patch('/bulk', validate(bulkPatch), asyncHandler(async (req, res) => {
  const { planId, features: selected, operation, exclusive, applyExisting } = req.body;
  if (new Set(selected.map((item) => item.key)).size !== selected.length) throw new AppError('Select each feature only once.', 422);
  const [plan, features] = await Promise.all([Plan.findById(planId), Feature.find({ key: { $in: selected.map((item) => item.key) } })]);
  if (!plan || plan.status !== 'ACTIVE') throw new AppError('Choose an active plan.', 422);
  if (features.length !== selected.length) throw new AppError('One or more selected features were not found.', 422);
  if (exclusive && (operation !== 'GRANT' || plan.kind === 'FREE' || plan.slug === 'free')) throw new AppError('Exclusive access requires granting an active paid plan.', 422);
  const byKey = new Map(features.map((feature) => [feature.key, feature]));
  for (const selectedItem of selected) {
    const feature = byKey.get(selectedItem.key);
    if (exclusive && feature.key === 'dashboard') throw new AppError('The workspace dashboard must remain free and available.', 422);
    validateAssignment(feature, { ...selectedItem, enabled: operation === 'GRANT' });
  }
  const otherPlans = exclusive && applyExisting ? await Plan.find({ _id: { $ne: plan._id } }).select('_id kind slug') : [];
  const session = await mongoose.startSession();
  let version;
  try {
    await session.withTransaction(async () => {
      for (const selectedItem of selected) {
        const feature = byKey.get(selectedItem.key);
        const assignment = { ...selectedItem, enabled: operation === 'GRANT' };
        if (exclusive) {
          await Feature.updateOne({ _id: feature._id }, { $set: { accessMode: 'PLAN_BASED' } }, { session });
          await Plan.updateMany({ _id: { $ne: plan._id } }, { $pull: { features: { feature: feature._id } } }, { session });
          if (applyExisting) for (const other of otherPlans) await writeSubscriberOverride(other, feature, { enabled: false }, session);
        }
        await writePlanAssignment(plan._id, feature, assignment, session);
        if (applyExisting) await writeSubscriberOverride(plan, feature, assignment, session);
      }
      const config = await AccessConfiguration.findOneAndUpdate({ key: 'global' }, { $inc: { version: 1 } }, { upsert: true, new: true, session });
      version = config.version;
      await audit('ACCESS_CONTROL_BULK_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Plan', targetId: plan._id,
        metadata: { features: selected, operation, exclusive, applyExisting, version }, ip: req.ip, session });
    });
  } finally {
    await session.endSession();
  }
  invalidateEntitlementCache();
  return success(res, { updated: selected.length, planId, configurationVersion: version });
}));

adminAccessControlRoutes.patch('/:key', validate(patch), asyncHandler(async (req, res) => {
  const feature = await Feature.findOne({ key: req.params.key });
  if (!feature) throw new AppError('Feature not found', 404);
  if (feature.key === 'dashboard' && req.body.accessMode && req.body.accessMode !== 'FREE') throw new AppError('The workspace dashboard must remain free and available.', 422);
  const before = feature.toObject();
  const { plans: assignments, applyExisting, locked, ...fields } = req.body;
  if (locked?.recommendedPlan && !(await Plan.exists({ _id: locked.recommendedPlan, kind: { $ne: 'FREE' }, status: 'ACTIVE' }))) throw new AppError('Recommended plan must be an active paid plan.', 422);
  if (assignments) {
    const known = await Plan.find({ _id: { $in: assignments.map((item) => item.planId) } });
    if (new Set(assignments.map((item) => item.planId)).size !== assignments.length || known.length !== assignments.length) throw new AppError('Plan assignments contain an unknown or duplicate plan.', 422);
    for (const item of assignments) validateAssignment(feature, item);
  }
  for (const [key, value] of Object.entries(fields)) feature.set(key, value);
  for (const [key, value] of Object.entries(locked || {})) feature.set(`locked.${key}`, value);
  const session = await mongoose.startSession();
  let version;
  try {
    await session.withTransaction(async () => {
      await feature.save({ session });
      if (assignments) for (const item of assignments) {
        const plan = await Plan.findById(item.planId).session(session);
        await writePlanAssignment(plan._id, feature, item, session);
        if (applyExisting) await writeSubscriberOverride(plan, feature, item, session);
      }
      const config = await AccessConfiguration.findOneAndUpdate({ key: 'global' }, { $inc: { version: 1 } }, { upsert: true, new: true, session });
      version = config.version;
      await audit('ACCESS_CONTROL_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Feature', targetId: feature._id,
        metadata: { before: { accessMode: before.accessMode, locked: before.locked }, after: { accessMode: feature.accessMode, locked: feature.locked }, plans: assignments, applyExisting: Boolean(applyExisting), version }, ip: req.ip, session });
    });
  } finally {
    await session.endSession();
  }
  invalidateEntitlementCache();
  return success(res, { feature, configurationVersion: version });
}));

adminAccessControlRoutes.get('/preview', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.planId)) throw new AppError('Invalid plan ID', 422);
  const plan = await Plan.findById(req.query.planId);
  if (!plan) throw new AppError('Plan not found', 404);
  const features = await Feature.find().sort({ category: 1, order: 1 });
  const assigned = new Map(plan.features.map((entry) => [String(entry.feature), entry]));
  const free = await Plan.findOne({ slug: 'free', status: 'ACTIVE' });
  const freeAssigned = new Map((free?.features || []).map((entry) => [String(entry.feature), entry]));
  return success(res, { plan: { id: plan.id, name: plan.name, slug: plan.slug }, capabilities: Object.fromEntries(features.map((feature) => {
    const entry = assigned.get(String(feature._id));
    const allowed = feature.status === 'ACTIVE' && feature.accessMode !== 'DISABLED' && (feature.accessMode === 'FREE' || Boolean(entry?.enabled) || Boolean(freeAssigned.get(String(feature._id))?.enabled));
    return [feature.key, { allowed, reason: allowed ? null : feature.accessMode === 'DISABLED' || feature.status === 'INACTIVE' ? 'FEATURE_DISABLED' : 'PLAN_REQUIRED', limit: feature.type === 'LIMIT' && allowed ? entry?.enabled ? entry.limit ?? null : freeAssigned.get(String(feature._id))?.limit ?? null : null }];
  })) });
}));
