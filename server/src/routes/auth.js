import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { userAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { clearCookie, issueCookie, login, safeIdentity } from '../services/authService.js';
import { checkAccess } from '../services/accessService.js';
import { audit } from '../services/auditService.js';

const loginInput = z.object({ email: z.email(), password: z.string().min(1) });
export const authRoutes = Router();
authRoutes.post('/login', rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === 'test' ? 1000 : 10, standardHeaders: 'draft-8', legacyHeaders: false }), validate(loginInput), asyncHandler(async (req, res) => {
  const user = await login(req.body.email, req.body.password, 'user');
  issueCookie(res, user, 'user');
  await audit('USER_LOGIN', { actorType: 'USER', actorId: user._id, targetType: 'User', targetId: user._id, ip: req.ip });
  return success(res, { user: safeIdentity(user), access: await checkAccess(user) });
}));
authRoutes.post('/logout', (_req, res) => { clearCookie(res, 'user'); return success(res, { loggedOut: true }); });
authRoutes.get('/me', userAuth, asyncHandler(async (req, res) => success(res, { user: safeIdentity(req.user), access: await checkAccess(req.user) })));
