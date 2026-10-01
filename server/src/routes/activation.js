import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { userAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { activateLink, findValidLink, registerWithLink } from '../services/activationService.js';
import { issueCookie, safeIdentity } from '../services/authService.js';
import { APPEARANCE_VALUES } from '../config/appearance.js';
import { recordServerEvent, linkLeadConversion } from '../analytics/analyticsService.js';
import { EVENTS } from '../analytics/events.js';
import { analyticsAllowed } from '../analytics/consentService.js';

const registrationInput = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.email(), password: z.string().min(12).max(200), gender: z.enum(['MALE', 'FEMALE']),
  preferences: z.object({ name: z.string().min(1).max(100).optional(), timezone: z.string().max(100).optional(), defaultCurrency: z.string().length(3).optional(), dateFormat: z.string().max(40).optional(), appearance: z.object({ mode: z.enum(APPEARANCE_VALUES.mode), preset: z.enum(APPEARANCE_VALUES.preset) }).strict().optional() }).optional(),
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
  if (analyticsAllowed(req)) {
    try { await recordServerEvent(EVENTS.REGISTRATION_COMPLETED, `registration:${user._id}`, user._id, req, res); }
    catch (error) { if (process.env.NODE_ENV !== 'test') console.error('Registration analytics failed', error); }
  }
  return success(res, { user: safeIdentity(user), activationPending: true }, 201);
}));
activationRoutes.post('/:key/activate', userAuth, asyncHandler(async (req, res) => {
  const access = await activateLink(req.params.key, req.user);
  if (analyticsAllowed(req)) {
    try {
      const lead = await linkLeadConversion(access.activationLink, req.user._id);
      await recordServerEvent(EVENTS.ACCESS_ACTIVATED, `access:${access._id}`, req.user._id, req, res, { planId: String(access.plan), ...(lead ? { leadCode: lead.leadCode } : {}) }, lead ? { firstTouch: lead.firstTouch, lastTouch: lead.lastTouch, lastNonDirectTouch: lead.lastNonDirectTouch } : null);
    } catch (error) { if (process.env.NODE_ENV !== 'test') console.error('Activation analytics failed', error); }
  }
  return success(res, { access });
}));
