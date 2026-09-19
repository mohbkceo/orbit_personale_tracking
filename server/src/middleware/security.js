import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

export const securityMiddleware = [
  helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }),
  cors({ origin: env.CLIENT_URL.split(',').map((item) => item.trim()), credentials: true }),
  rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 10_000 : 240 }),
];

export function verifyBrowserOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/api/telegram/webhook/')) return next();
  const origin = req.get('Origin');
  const allowed = [...env.CLIENT_URL.split(',').map((item) => item.trim()), env.APP_BASE_URL];
  if (origin && !allowed.includes(origin)) return res.status(403).json({ success: false, code: 'INVALID_ORIGIN', message: 'Request origin not allowed' });
  next();
}

export function rejectUnsafeKeys(req, res, next) {
  const serialized = JSON.stringify({ body: req.body, query: req.query, params: req.params });
  if (/\$(?:where|gt|gte|lt|lte|ne|in|nin|regex)|__proto__|constructor/i.test(serialized)) {
    return res.status(400).json({ success: false, message: 'Unsafe input rejected' });
  }
  next();
}
