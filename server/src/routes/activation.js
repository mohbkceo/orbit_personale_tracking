import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { userAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { activateLink, findValidLink, registerWithLink } from '../services/activationService.js';
import { issueCookie, safeIdentity } from '../services/authService.js';

const registrationInput = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.email(), password: z.string().min(12).max(200),
  preferences: z.object({ name: z.string().min(1).max(100).optional(), timezone: z.string().max(100).optional(), defaultCurrency: z.string().length(3).optional(), dateFormat: z.string().max(40).optional() }).optional(),
});
const validationLimit = rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 60 });
export const activationRoutes = Router();

activationRoutes.get('/:key', validationLimit, asyncHandler(async (req, res) => {
  const link = await findValidLink(req.params.key, { countOpen: true });
  return success(res, { valid: true, requiresExistingAccount: Boolean(link.intendedUser), plan: { name: link.plan.name, durationValue: link.plan.durationValue, durationUnit: link.plan.durationUnit }, expiresAt: link.expiresAt });
}));
activationRoutes.post('/:key/register', validationLimit, validate(registrationInput), asyncHandler(async (req, res) => {
  const user = await registerWithLink(req.params.key, req.body);
  issueCookie(res, user, 'user');
  return success(res, { user: safeIdentity(user), activationPending: true }, 201);
}));
activationRoutes.post('/:key/activate', userAuth, asyncHandler(async (req, res) => {
  const access = await activateLink(req.params.key, req.user);
  return success(res, { access });
}));
