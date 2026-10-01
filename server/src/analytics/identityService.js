import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { AnalyticsSession } from '../models/AnalyticsSession.js';
import { AnalyticsLead } from '../models/AnalyticsLead.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };
const visitorCookie = 'orbit_visitor';
const sessionCookie = 'orbit_analytics_session';
const sign = (id, type) => jwt.sign({ sub: id, type }, env.AUTH_JWT_SECRET, { issuer: 'orbit-analytics', expiresIn: type === 'visitor' ? '365d' : '1d' });
const read = (req, name, type) => {
  try { const token = jwt.verify(req.cookies?.[name], env.AUTH_JWT_SECRET, { issuer: 'orbit-analytics' }); return token.type === type && /^[0-9a-f-]{36}$/i.test(token.sub) ? token.sub : null; } catch { return null; }
};

export function readAnalyticsIds(req) { return { visitorId: read(req, visitorCookie, 'visitor'), sessionId: read(req, sessionCookie, 'session') }; }

export async function ensureVisitor(req, res, userId = null) {
  let { visitorId } = readAnalyticsIds(req);
  let visitor = visitorId ? await AnalyticsVisitor.findOne({ visitorId }) : null;
  if (visitor?.user && userId && String(visitor.user) !== String(userId)) {
    const previousSession = readAnalyticsIds(req).sessionId;
    if (previousSession) await AnalyticsSession.updateOne({ sessionId: previousSession, visitorId, endedAt: null }, { $set: { endedAt: new Date() } });
    visitor = null;
    visitorId = null;
  }
  if (!visitor) {
    visitorId = randomUUID();
    const now = new Date();
    visitor = await AnalyticsVisitor.create({ visitorId, ...(userId ? { user: userId } : {}), firstSeenAt: now, lastSeenAt: now });
    res.cookie(visitorCookie, sign(visitorId, 'visitor'), { ...cookieOptions, maxAge: 365 * 86400000 });
    res.clearCookie(sessionCookie, cookieOptions);
  } else if (userId && !visitor.user) {
    // Claim only an anonymous identity. A browser already tied to a different account was rotated above.
    visitor = await AnalyticsVisitor.findOneAndUpdate({ visitorId, user: null }, { $set: { user: userId } }, { new: true }) || visitor;
    await Promise.all([
      AnalyticsSession.updateMany({ visitorId, user: null }, { $set: { user: userId } }),
      AnalyticsLead.updateMany({ visitorId, user: null }, { $set: { user: userId } }),
      AnalyticsEvent.updateMany({ visitorId, user: null }, { $set: { user: userId } }),
    ]);
  }
  return visitor;
}

export function setSessionCookie(res, sessionId) {
  res.cookie(sessionCookie, sign(sessionId, 'session'), { ...cookieOptions, maxAge: 86400000 });
}

export function clearAnalyticsIdentity(res) {
  res.clearCookie(visitorCookie, cookieOptions);
  res.clearCookie(sessionCookie, cookieOptions);
}
