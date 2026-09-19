import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { ActivationLink } from '../models/ActivationLink.js';
import { adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { activationUrl, createActivationLink } from '../services/activationService.js';
import { audit } from '../services/auditService.js';

export const adminActivationLinkRoutes = Router();
adminActivationLinkRoutes.use(adminAuth);
adminActivationLinkRoutes.get('/', asyncHandler(async (req, res) => {
  await ActivationLink.updateMany({ status: 'ACTIVE', expiresAt: { $lte: new Date() } }, { $set: { status: 'EXPIRED' } });
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = ['ACTIVE', 'USED', 'REVOKED', 'EXPIRED'].includes(req.query.status) ? { status: req.query.status } : {};
  const [data, total] = await Promise.all([ActivationLink.find(filter).populate('plan', 'name durationValue durationUnit').populate('createdByAdmin', 'fullName email').populate('activatedUser', 'fullName email').populate('intendedUser', 'fullName email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), ActivationLink.countDocuments(filter)]);
  return success(res, data, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
adminActivationLinkRoutes.post('/', validate(z.object({ planId: z.string().regex(/^[a-f\d]{24}$/i), validityDays: z.coerce.number().int().min(1).max(365).default(7), note: z.string().max(500).default('') })), asyncHandler(async (req, res) => success(res, await createActivationLink(req.body.planId, req.admin._id, req.body), 201)));
adminActivationLinkRoutes.get('/:id/url', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Activation Link not found', 404);
  return success(res, { url: await activationUrl(req.params.id) });
}));
adminActivationLinkRoutes.post('/:id/revoke', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Activation Link not found', 404);
  const link = await ActivationLink.findOneAndUpdate({ _id: req.params.id, status: 'ACTIVE' }, { $set: { status: 'REVOKED' } }, { new: true });
  if (!link) throw new AppError('Active Activation Link not found', 404);
  await audit('ACTIVATION_LINK_REVOKED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'ActivationLink', targetId: link._id });
  return success(res, link);
}));
