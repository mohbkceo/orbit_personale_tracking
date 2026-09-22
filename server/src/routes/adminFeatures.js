import mongoose from 'mongoose';
import { Router } from 'express';
import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { featureInput } from '../services/planService.js';

export const adminFeatureRoutes = Router();
adminFeatureRoutes.use(adminAuth);
adminFeatureRoutes.get('/', asyncHandler(async (_req, res) => success(res, await Feature.find().sort({ order: 1, name: 1 }))));
adminFeatureRoutes.post('/', validate(featureInput), asyncHandler(async (req, res) => {
  const feature = await Feature.create(req.body);
  await audit('FEATURE_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Feature', targetId: feature._id });
  return success(res, feature, 201);
}));
adminFeatureRoutes.patch('/:id', validate(featureInput.partial()), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Feature not found', 404);
  if (req.body.type) {
    const current = await Feature.findById(req.params.id);
    if (!current) throw new AppError('Feature not found', 404);
    if (current.type !== req.body.type && await Plan.exists({ features: { $elemMatch: { feature: current._id, enabled: true } } })) {
      throw new AppError('Disable this feature in plans before changing its type', 409);
    }
  }
  const feature = await Feature.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!feature) throw new AppError('Feature not found', 404);
  await audit('FEATURE_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Feature', targetId: feature._id });
  return success(res, feature);
}));
adminFeatureRoutes.delete('/:id', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Feature not found', 404);
  if (await Plan.exists({ 'features.feature': req.params.id })) throw new AppError('Remove this feature from plans before deleting it', 409);
  const feature = await Feature.findByIdAndDelete(req.params.id);
  if (!feature) throw new AppError('Feature not found', 404);
  await audit('FEATURE_DELETED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Feature', targetId: feature._id });
  return success(res, { deleted: true });
}));
