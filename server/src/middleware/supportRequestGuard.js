import crypto from 'node:crypto';
import { SupportSession } from '../models/SupportSession.js';
import { audit } from '../services/auditService.js';

// An active support cookie prevents any ordinary user API from being used in
// another tab while the admin is in a read-only support session.
export async function supportRequestGuard(req, res, next) {
  try {
    if (
      !req.path.startsWith('/api/') ||
      req.path.startsWith('/api/health') ||
      req.path.startsWith('/api/telegram/webhook/')
    )
      return next();
    const token = req.cookies?.orbit_support;
    if (!token) return next();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await SupportSession.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) return next();
    if (
      req.path.startsWith('/api/admin/support/') &&
      (['GET', 'HEAD'].includes(req.method) ||
        (req.method === 'POST' && req.path === '/api/admin/support/exit'))
    )
      return next();
    await audit('SUPPORT_OPERATION_DENIED', {
      actorType: 'ADMIN',
      actorId: session.admin,
      targetType: 'User',
      targetId: session.user,
      metadata: {
        supportSessionId: String(session._id),
        method: req.method,
        path: req.path.slice(0, 150),
        scope: 'READ_ONLY',
      },
      ip: req.ip,
    });
    return res
      .status(403)
      .json({
        success: false,
        code: 'SUPPORT_READ_ONLY',
        message: 'Exit Support Mode before using regular APIs.',
      });
  } catch (error) {
    next(error);
  }
}
