import { Router } from 'express';
import { userAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { checkAccess } from '../services/accessService.js';
import { AccessSubscription } from '../models/AccessSubscription.js';

export const accessRoutes = Router();
accessRoutes.use(userAuth);
accessRoutes.get('/', asyncHandler(async (req, res) => success(res, { ...(await checkAccess(req.user)), history: await AccessSubscription.find({ user: req.user._id }).sort({ activatedAt: -1 }).limit(20) })));
