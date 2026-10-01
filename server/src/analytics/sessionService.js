import { randomUUID } from 'node:crypto';
import { AnalyticsSession } from '../models/AnalyticsSession.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { parseAttribution, persistTouches } from './attributionService.js';
import { ensureVisitor, readAnalyticsIds, setSessionCookie } from './identityService.js';
import { env } from '../config/env.js';

export const INACTIVITY_MS = 30 * 60_000;
const agentInfo = (agent = '') => ({
  deviceCategory: /tablet|ipad/i.test(agent) ? 'tablet' : /mobile|iphone|android/i.test(agent) ? 'mobile' : 'desktop',
  browser: /edg\//i.test(agent) ? 'Edge' : /firefox\//i.test(agent) ? 'Firefox' : /chrome\//i.test(agent) ? 'Chrome' : /safari\//i.test(agent) ? 'Safari' : 'Other',
  os: /windows/i.test(agent) ? 'Windows' : /android/i.test(agent) ? 'Android' : /iphone|ipad|ios/i.test(agent) ? 'iOS' : /mac os/i.test(agent) ? 'macOS' : /linux/i.test(agent) ? 'Linux' : 'Other',
});
const acquisitionKey = (touch) => JSON.stringify([
  touch?.channel, touch?.utmSource, touch?.utmMedium, touch?.utmCampaign, touch?.utmContent, touch?.utmTerm, touch?.utmId,
  touch?.referrerHost, Object.fromEntries(touch?.clickIds instanceof Map ? touch.clickIds : Object.entries(touch?.clickIds || {})),
]);
const internalReferrer = (referrer, origins) => {
  try { return origins.some((origin) => new URL(referrer).origin === new URL(origin).origin); } catch { return false; }
};

export async function ensureSession(req, res, context = {}, userId = null) {
  const visitor = await ensureVisitor(req, res, userId);
  const now = new Date();
  const ids = readAnalyticsIds(req);
  let session = ids.visitorId === visitor.visitorId && ids.sessionId ? await AnalyticsSession.findOne({ sessionId: ids.sessionId, visitorId: visitor.visitorId }) : null;
  const origins = [...env.CLIENT_URL.split(',').map((value) => value.trim()), env.APP_BASE_URL];
  const entryTouch = context.entry && context.landingUrl && !internalReferrer(context.referrer, origins) ? parseAttribution(context, origins, now) : null;
  const newAcquisition = entryTouch && entryTouch.channel !== 'direct' && acquisitionKey(entryTouch) !== acquisitionKey(session?.attribution);
  if (session && !newAcquisition && (!session.endedAt && now - session.lastActivityAt < INACTIVITY_MS) && (!session.user || !userId || String(session.user) === String(userId))) {
    await Promise.all([
      AnalyticsSession.updateOne({ _id: session._id }, { $set: { lastActivityAt: now, ...(userId && !session.user ? { user: userId } : {}) } }),
      AnalyticsVisitor.updateOne({ _id: visitor._id }, { $max: { lastSeenAt: now } }),
    ]);
    return { visitor, session, newSession: false };
  }
  if (session && !session.endedAt) await AnalyticsSession.updateOne({ _id: session._id }, { $set: { endedAt: session.lastActivityAt } });
  const touch = entryTouch || parseAttribution(context, origins, now);
  const updatedVisitor = await persistTouches(visitor, touch);
  session = await AnalyticsSession.create({ sessionId: randomUUID(), visitorId: visitor.visitorId, ...(userId ? { user: userId } : {}), startedAt: now, lastActivityAt: now, landingPage: touch.landingPage, landingPath: touch.landingPath, referrer: touch.referrer, attribution: touch, ...agentInfo(req.get('User-Agent')), locale: context.locale, timezone: context.timezone });
  setSessionCookie(res, session.sessionId);
  return { visitor: updatedVisitor, session, newSession: true };
}
