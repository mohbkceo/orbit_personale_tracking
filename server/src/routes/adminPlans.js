import mongoose from 'mongoose';
import { Router } from 'express';
import { Plan } from '../models/Plan.js';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { planInput, validateEntitlements } from '../services/planService.js';

export const adminPlanRoutes = Router();
adminPlanRoutes.use(adminAuth);
adminPlanRoutes.get('/', asyncHandler(async (_req, res) => success(res, await Plan.find().populate('features.feature', 'key name description category icon type order status publicVisible').sort({ createdAt: -1 }))));
adminPlanRoutes.post('/', validate(planInput), asyncHandler(async (req, res) => {
  await validateEntitlements(req.body.features);
  const plan = await Plan.create({ ...req.body, createdBy: req.admin._id });
  await audit('PLAN_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Plan', targetId: plan._id });
  return success(res, await plan.populate('features.feature', 'key name description category icon type order status publicVisible'), 201);
}));
adminPlanRoutes.patch('/:id', validate(planInput.partial()), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Plan not found', 404);
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw new AppError('Plan not found', 404);
  await validateEntitlements(req.body.features);
  for (const [key, value] of Object.entries(req.body)) {
    if (['price', 'appearance', 'public'].includes(key)) {
      for (const [field, fieldValue] of Object.entries(value)) plan.set(`${key}.${field}`, fieldValue);
    } else plan.set(key, value);
  }
  await plan.save();
  await audit(plan.status === 'INACTIVE' ? 'PLAN_DISABLED' : 'PLAN_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Plan', targetId: plan._id });
  return success(res, await plan.populate('features.feature', 'key name description category icon type order status publicVisible'));
}));
