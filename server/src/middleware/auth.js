import { authenticateCookie } from '../services/authService.js';
import { AppError } from '../utils/AppError.js';
import { resolveUserEntitlements, entitlementError } from '../services/entitlementService.js';

export async function userAuth(req, _res, next) {
  try { req.user = await authenticateCookie(req, 'user'); next(); } catch (error) { next(error); }
}

export async function accessGuard(req, _res, next) {
  try {
    if (req.user.status !== 'ACTIVE') throw new AppError('Your Orbit account is suspended.', 403, undefined, 'USER_SUSPENDED');
    next();
  } catch (error) { next(error); }
}

export const requireFeature = (key) => async (req, _res, next) => {
  try {
    req.entitlements ||= await resolveUserEntitlements(req.user);
    const decision = req.entitlements.decisions[key];
    if (!decision?.allowed) throw decision ? entitlementError(decision) : new AppError('Unknown entitlement', 500);
    next();
  } catch (error) { next(error); }
};

export async function adminAuth(req, _res, next) {
  try { req.admin = await authenticateCookie(req, 'admin'); next(); } catch (error) { next(error); }
}

export const adminRoleGuard = (...roles) => (req, _res, next) => roles.includes(req.admin?.role) ? next() : next(new AppError('Forbidden', 403, undefined, 'ADMIN_FORBIDDEN'));
