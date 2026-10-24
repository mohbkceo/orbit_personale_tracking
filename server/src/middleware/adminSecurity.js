import bcrypt from 'bcryptjs';
import { AppError } from '../utils/AppError.js';
import { Admin } from '../models/Admin.js';

export function requireAdminCsrf(req, _res, next) {
  if (req.get('X-Orbit-Admin-Action') !== '1')
    return next(
      new AppError('Admin action verification required', 403, undefined, 'CSRF_REQUIRED'),
    );
  const origin = req.get('Origin');
  const fetchSite = req.get('Sec-Fetch-Site');
  if (!origin && fetchSite && !['same-origin', 'none'].includes(fetchSite))
    return next(new AppError('Cross-site admin action denied', 403, undefined, 'CSRF_REQUIRED'));
  next();
}

export function requireSuperAdmin(req, _res, next) {
  if (req.admin?.role !== 'SUPER_ADMIN' || req.admin.status !== 'ACTIVE')
    return next(new AppError('Super Admin access required', 403, undefined, 'ADMIN_FORBIDDEN'));
  next();
}

export async function verifyFreshAdmin(req, _res, next) {
  try {
    const admin = await Admin.findById(req.admin._id).select('+passwordHash');
    if (!admin || !(await bcrypt.compare(String(req.body.adminPassword || ''), admin.passwordHash)))
      throw new AppError('Confirm your admin password', 403, undefined, 'ADMIN_REAUTH_REQUIRED');
    next();
  } catch (error) {
    next(error);
  }
}
