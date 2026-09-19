import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { Plan } from '../models/Plan.js';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';

const planInput = z.object({ name: z.string().trim().min(1).max(100), durationValue: z.coerce.number().int().min(1).max(10000), durationUnit: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']), description: z.string().max(500).default(''), status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE') });
export const adminPlanRoutes = Router();
adminPlanRoutes.use(adminAuth);
adminPlanRoutes.get('/', asyncHandler(async (_req, res) => success(res, await Plan.find().sort({ createdAt: -1 }))));
adminPlanRoutes.post('/', validate(planInput), asyncHandler(async (req, res) => {
  const plan = await Plan.create({ ...req.body, createdBy: req.admin._id });
  await audit('PLAN_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Plan', targetId: plan._id });
  return success(res, plan, 201);
}));
adminPlanRoutes.patch('/:id', validate(planInput.partial()), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Plan not found', 404);
  const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!plan) throw new AppError('Plan not found', 404);
  await audit(plan.status === 'INACTIVE' ? 'PLAN_DISABLED' : 'PLAN_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Plan', targetId: plan._id });
  return success(res, plan);
}));
