import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { adminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { clearCookie, issueCookie, login, safeIdentity } from '../services/authService.js';
import { audit } from '../services/auditService.js';

export const adminAuthRoutes = Router();
adminAuthRoutes.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 10 }), validate(z.object({ email: z.email(), password: z.string().min(1) })), asyncHandler(async (req, res) => {
  const admin = await login(req.body.email, req.body.password, 'admin');
  issueCookie(res, admin, 'admin');
  await audit('ADMIN_LOGIN', { actorType: 'ADMIN', actorId: admin._id, targetType: 'Admin', targetId: admin._id, ip: req.ip });
  return success(res, { admin: safeIdentity(admin) });
}));
adminAuthRoutes.post('/logout', (_req, res) => { clearCookie(res, 'admin'); return success(res, { loggedOut: true }); });
adminAuthRoutes.get('/me', adminAuth, (req, res) => success(res, { admin: safeIdentity(req.admin) }));
