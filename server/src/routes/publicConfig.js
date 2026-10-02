import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getSalesConfig } from '../services/siteConfigService.js';

export const publicConfigRoutes = Router();
publicConfigRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const sales = await getSalesConfig();
    return success(res, { sales: sales.contactVisible ? sales : { ...sales, salesEmail: '', supportEmail: '', phoneNumber: '' } });
  }),
);
