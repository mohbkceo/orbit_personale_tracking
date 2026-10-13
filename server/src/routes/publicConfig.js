import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getSalesConfig } from '../services/siteConfigService.js';
import { paymentsAvailable } from '../services/slickpayProvider.js';

export const publicConfigRoutes = Router();
publicConfigRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const sales = await getSalesConfig();
    return success(res, { payments: { enabled: paymentsAvailable(), currency: 'DZD' }, sales: sales.contactVisible ? sales : { ...sales, salesEmail: '', supportEmail: '', phoneNumber: '' } });
  }),
);
