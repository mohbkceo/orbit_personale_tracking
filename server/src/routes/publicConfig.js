import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getSalesConfig } from '../services/siteConfigService.js';

export const publicConfigRoutes = Router();
publicConfigRoutes.get(
  '/',
  asyncHandler(async (_req, res) => success(res, { sales: await getSalesConfig() })),
);
