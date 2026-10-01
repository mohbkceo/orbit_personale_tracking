import { classifyChannel } from './channelClassifier.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { analyticsPath } from '../../../shared/analyticsPath.js';

const FIELDS = { utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign', utm_content: 'utmContent', utm_term: 'utmTerm', utm_id: 'utmId' };
const CLICK_IDS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid'];
const clean = (value, max = 160) => typeof value === 'string' && value.length <= max && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127) ? value.trim() || undefined : undefined;
const safeUrl = (raw, ownOrigin) => {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try { const url = new URL(raw, ownOrigin); return ['http:', 'https:'].includes(url.protocol) ? url : null; } catch { return null; }
};

export function parseAttribution(input, ownOrigin, now = new Date()) {
  const ownOrigins = (Array.isArray(ownOrigin) ? ownOrigin : [ownOrigin]).map((value) => new URL(value));
  const own = ownOrigins[0];
  const requestedLanding = safeUrl(input?.landingUrl, own.origin);
  const landing = ownOrigins.some((value) => requestedLanding?.origin === value.origin) ? requestedLanding : null;
  const referrer = safeUrl(input?.referrer, own.origin);
  const query = landing?.searchParams || new URLSearchParams();
  const landingPath = analyticsPath(landing?.pathname || '/');
  const touch = { landingPage: landing ? `${landing.origin}${landingPath}`.slice(0, 1024) : own.origin, landingPath, occurredAt: now, clickIds: {} };
  for (const [param, field] of Object.entries(FIELDS)) {
    const value = clean(query.get(param));
    if (value) touch[field] = value;
  }
  for (const param of CLICK_IDS) {
    const value = clean(query.get(param), 256);
    if (value) touch.clickIds[param] = value;
  }
  touch.queryParams = Object.fromEntries([...Object.keys(FIELDS), ...CLICK_IDS].filter((key) => query.has(key)).map((key) => [key, clean(query.get(key), 256)]).filter(([, value]) => value));
  if (referrer && !ownOrigins.some((value) => referrer.origin === value.origin)) {
    touch.referrer = referrer.origin;
    touch.referrerHost = referrer.hostname.slice(0, 253);
  }
  touch.channel = input?.landingUrl && !landing ? 'unknown' : classifyChannel(touch, ownOrigins.map((value) => value.hostname));
  return touch;
}

export async function persistTouches(visitor, touch) {
  await AnalyticsVisitor.updateOne({ _id: visitor._id, 'firstTouch.channel': { $exists: false } }, { $set: { firstTouch: touch } });
  const recent = { _id: visitor._id, $or: [{ 'lastTouch.occurredAt': { $lt: touch.occurredAt } }, { 'lastTouch.occurredAt': { $exists: false } }] };
  await AnalyticsVisitor.updateOne(recent, { $set: { lastTouch: touch, lastSeenAt: touch.occurredAt } });
  if (touch.channel !== 'direct' && touch.channel !== 'unknown') {
    await AnalyticsVisitor.updateOne({ _id: visitor._id, $or: [{ 'lastNonDirectTouch.occurredAt': { $lt: touch.occurredAt } }, { 'lastNonDirectTouch.occurredAt': { $exists: false } }] }, { $set: { lastNonDirectTouch: touch } });
  }
  return AnalyticsVisitor.findById(visitor._id);
}
