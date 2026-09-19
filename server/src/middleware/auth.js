import { authenticateCookie } from '../services/authService.js';
import { checkAccess } from '../services/accessService.js';
import { AppError } from '../utils/AppError.js';

export async function userAuth(req, _res, next) {
  try { req.user = await authenticateCookie(req, 'user'); next(); } catch (error) { next(error); }
}

export async function accessGuard(req, _res, next) {
  try {
    const access = await checkAccess(req.user);
    if (!access.eligible) {
      const code = access.reason === 'SUSPENDED' ? 'USER_SUSPENDED' : access.reason === 'EXPIRED' ? 'ACCESS_EXPIRED' : 'ACCESS_REQUIRED';
      const message = access.reason === 'SUSPENDED' ? 'Your Orbit account is suspended.' : access.reason === 'EXPIRED' ? 'Your Orbit access has expired.' : 'Activate an Orbit access plan to continue.';
      throw new AppError(message, 403, undefined, code);
    }
    req.access = access;
    next();
  } catch (error) { next(error); }
}

export async function adminAuth(req, _res, next) {
  try { req.admin = await authenticateCookie(req, 'admin'); next(); } catch (error) { next(error); }
}

export const adminRoleGuard = (...roles) => (req, _res, next) => roles.includes(req.admin?.role) ? next() : next(new AppError('Forbidden', 403, undefined, 'ADMIN_FORBIDDEN'));
