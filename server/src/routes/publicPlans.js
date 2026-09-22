import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { publicPlans } from '../services/planService.js';

export const publicPlanRoutes = Router();
publicPlanRoutes.get('/', asyncHandler(async (_req, res) => success(res, await publicPlans())));
