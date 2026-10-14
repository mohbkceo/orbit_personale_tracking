import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { resolveUserEntitlements } from '../services/entitlementService.js';
import { featureUsage } from '../services/featureLimitService.js';

export const meCapabilityRoutes = Router();
meCapabilityRoutes.get('/capabilities', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const { effectivePlan, subscriptionExpiresAt, configurationVersion, decisions } = await resolveUserEntitlements(req.user);
  const usage = await featureUsage(req.user._id, decisions);
  return success(res, { effectivePlan, subscriptionExpiresAt, configurationVersion,
    capabilities: Object.fromEntries(Object.entries(decisions).map(([key, value]) => [key, { ...value, ...(usage[key] || {}) }])) });
}));
meCapabilityRoutes.get('/entitlements/:key', asyncHandler(async (req, res) => {
  const decision = (await resolveUserEntitlements(req.user)).decisions[req.params.key];
  if (!decision) throw new AppError('Feature not found', 404, undefined, 'FEATURE_UNKNOWN');
  return success(res, decision);
}));
