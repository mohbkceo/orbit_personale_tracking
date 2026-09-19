import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { Admin } from '../models/Admin.js';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, normalizeEmail, safeIdentity } from '../services/authService.js';
import { audit } from '../services/auditService.js';

export const adminAdminRoutes = Router();
adminAdminRoutes.use(adminAuth, adminRoleGuard('SUPER_ADMIN'));
adminAdminRoutes.get('/', asyncHandler(async (_req, res) => success(res, await Admin.find().select('fullName email role status createdAt lastLoginAt').sort({ createdAt: -1 }))));
adminAdminRoutes.post('/', validate(z.object({ fullName: z.string().trim().min(2).max(120), email: z.email(), password: z.string().min(12).max(200), role: z.enum(['ADMIN', 'SUPER_ADMIN']).default('ADMIN') })), asyncHandler(async (req, res) => {
  const admin = await Admin.create({ fullName: req.body.fullName, email: normalizeEmail(req.body.email), passwordHash: await hashPassword(req.body.password), role: req.body.role, createdBy: req.admin._id });
  await audit('ADMIN_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Admin', targetId: admin._id });
  return success(res, safeIdentity(admin), 201);
}));
adminAdminRoutes.patch('/:id', validate(z.object({ role: z.enum(['ADMIN', 'SUPER_ADMIN']).optional(), status: z.enum(['ACTIVE', 'DISABLED']).optional() })), asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Admin not found', 404);
  if (String(req.admin._id) === req.params.id && (req.body.status === 'DISABLED' || req.body.role === 'ADMIN')) throw new AppError('You cannot disable or demote your own account.', 409);
  const admin = await Admin.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
  if (!admin) throw new AppError('Admin not found', 404);
  await audit(req.body.status === 'DISABLED' ? 'ADMIN_DISABLED' : 'ADMIN_ROLE_CHANGED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'Admin', targetId: admin._id });
  return success(res, safeIdentity(admin));
}));
