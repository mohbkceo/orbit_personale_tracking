import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { authenticateCookie } from '../services/authService.js';
import { ensureSession } from '../analytics/sessionService.js';
import { ingestWebEvents, createLead } from '../analytics/analyticsService.js';
import { WEB_EVENTS } from '../analytics/events.js';
import { clearAnalyticsIdentity } from '../analytics/identityService.js';
import { analyticsAllowed, grantAnalyticsConsent, clearAnalyticsConsent } from '../analytics/consentService.js';

const limit = rateLimit({ windowMs: 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 60, standardHeaders: 'draft-8', legacyHeaders: false });
const path = z.string().max(512).regex(/^\/(?!\/)[^?#]*$/);
const context = z.strictObject({ landingUrl: z.url().max(2048), referrer: z.string().max(2048).optional(), entry: z.boolean().optional(), locale: z.string().max(32).optional(), timezone: z.string().max(80).optional() });
const safeProperties = (value, depth = 0) => {
  if (depth > 2) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return true;
  if (typeof value === 'string') return value.length <= 256;
  if (Array.isArray(value)) return value.length <= 10 && value.every((item) => safeProperties(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.keys(value).length > 12) return false;
  return Object.entries(value).every(([key, item]) => /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) && safeProperties(item, depth + 1));
};
const event = z.strictObject({ eventId: z.uuid(), name: z.string().refine((name) => WEB_EVENTS.has(name)), path, properties: z.record(z.string(), z.unknown()).refine((value) => JSON.stringify(value).length <= 2048 && safeProperties(value)).optional(), occurredAt: z.iso.datetime().refine((value) => { const age = Date.now() - Date.parse(value); return age >= -300000 && age <= 86400000; }) });
const batch = z.strictObject({ events: z.array(event).min(1).max(25) });
const smallBody = (req, res, next) => JSON.stringify(req.body || {}).length > 32_768 ? res.status(413).json({ success: false, message: 'Analytics payload too large' }) : next();
const knownUser = async (req) => { try { return await authenticateCookie(req, 'user'); } catch { return null; } };

export const analyticsRoutes = Router();
analyticsRoutes.use(limit, smallBody);
analyticsRoutes.use((req, res, next) => /(?:bot|crawler|spider|headless|slurp|bingpreview)/i.test(req.get('User-Agent') || '') ? res.status(204).end() : next());
analyticsRoutes.post('/consent', validate(z.strictObject({ granted: z.literal(true) })), (_req, res) => { grantAnalyticsConsent(res); return success(res, { granted: true }); });
analyticsRoutes.post('/opt-out', (_req, res) => { clearAnalyticsIdentity(res); clearAnalyticsConsent(res); return success(res, { optedOut: true }); });
analyticsRoutes.use((req, res, next) => analyticsAllowed(req) ? next() : res.status(204).end());
analyticsRoutes.post('/session', validate(context), asyncHandler(async (req, res) => {
  const user = await knownUser(req);
  const { visitor, session } = await ensureSession(req, res, req.body, user?._id);
  return success(res, { visitorId: visitor.visitorId, sessionId: session.sessionId, attribution: { firstTouch: visitor.firstTouch, lastTouch: visitor.lastTouch, lastNonDirectTouch: visitor.lastNonDirectTouch } });
}));
analyticsRoutes.post('/events/batch', validate(batch), asyncHandler(async (req, res) => { const user = await knownUser(req); return success(res, await ingestWebEvents(req, res, req.body.events, user?._id)); }));
analyticsRoutes.post('/leads', asyncHandler(async (req, res) => {
  const user = await knownUser(req);
  const lead = await createLead(req, res, user?._id);
  return success(res, { leadCode: lead.leadCode }, 201);
}));
