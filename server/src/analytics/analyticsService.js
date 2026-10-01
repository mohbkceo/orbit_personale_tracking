import { randomUUID } from 'node:crypto';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { AnalyticsLead } from '../models/AnalyticsLead.js';
import { AnalyticsSession } from '../models/AnalyticsSession.js';
import { ensureSession } from './sessionService.js';
import { dispatchConversion } from './conversionDispatcher.js';
import { dispatchAnalyticsEvents } from './eventDispatcher.js';
import { EVENTS } from './events.js';
import { readAnalyticsIds } from './identityService.js';
import { analyticsAllowed } from './consentService.js';
import { analyticsPath } from '../../../shared/analyticsPath.js';

const snapshot = (visitor) => ({ firstTouch: visitor.firstTouch, lastTouch: visitor.lastTouch, lastNonDirectTouch: visitor.lastNonDirectTouch });

export async function ingestWebEvents(req, res, events, userId = null) {
  const { visitor, session } = await ensureSession(req, res, { landingUrl: events[0]?.path ? `${req.protocol}://${req.get('host')}${events[0].path}` : undefined }, userId);
  const rows = events.map((event) => ({
    eventId: event.eventId, name: event.name, visitorId: visitor.visitorId, sessionId: session.sessionId,
    ...(session.user ? { user: session.user } : {}), source: 'web', path: analyticsPath(event.path),
    properties: event.properties || {}, occurredAt: new Date(event.occurredAt), attribution: snapshot(visitor),
  }));
  if (!rows.length) return { accepted: 0 };
  const operations = rows.map((row) => ({ updateOne: { filter: { eventId: row.eventId }, update: { $setOnInsert: row }, upsert: true } }));
  const result = await AnalyticsEvent.bulkWrite(operations, { ordered: false });
  if (result.upsertedCount) void dispatchAnalyticsEvents(Object.keys(result.upsertedIds).map((index) => rows[Number(index)]));
  return { accepted: result.upsertedCount };
}

export async function recordServerEvent(name, eventId, userId, req, res, properties = {}, attributionOverride = null) {
  const { visitor, session } = await ensureSession(req, res, {}, userId);
  const row = { eventId, name, visitorId: visitor.visitorId, sessionId: session.sessionId, user: userId, source: 'server', path: session.landingPath, properties, occurredAt: new Date(), attribution: attributionOverride || snapshot(visitor) };
  const result = await AnalyticsEvent.updateOne({ eventId }, { $setOnInsert: row }, { upsert: true });
  if (result.upsertedCount) { void dispatchAnalyticsEvents([row]); void dispatchConversion(row); }
  return result.upsertedCount === 1;
}

export async function createLead(req, res, userId = null) {
  const { visitor, session } = await ensureSession(req, res, {}, userId);
  let lead = await AnalyticsLead.findOne({ sessionId: session.sessionId, source: 'whatsapp' });
  if (lead) return lead;
  for (let attempt = 0; attempt < 3 && !lead; attempt += 1) {
    try { lead = await AnalyticsLead.create({ leadCode: `LEAD-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`, visitorId: visitor.visitorId, sessionId: session.sessionId, ...(session.user ? { user: session.user } : {}), source: 'whatsapp', ...snapshot(visitor) }); }
    catch (error) { if (error.code !== 11000) throw error; lead = await AnalyticsLead.findOne({ sessionId: session.sessionId, source: 'whatsapp' }); if (!lead && attempt === 2) throw error; }
  }
  try {
    const events = [
      { eventId: `lead:${lead._id}`, name: EVENTS.LEAD_CREATED, visitorId: visitor.visitorId, sessionId: session.sessionId, ...(session.user ? { user: session.user } : {}), source: 'server', properties: { leadCode: lead.leadCode }, occurredAt: new Date(), attribution: snapshot(visitor) },
      { eventId: `contact:${lead._id}`, name: EVENTS.CONTACT_STARTED, visitorId: visitor.visitorId, sessionId: session.sessionId, ...(session.user ? { user: session.user } : {}), source: 'server', properties: { leadCode: lead.leadCode, channel: 'whatsapp' }, occurredAt: new Date(), attribution: snapshot(visitor) },
    ];
    await AnalyticsEvent.insertMany(events);
    void dispatchAnalyticsEvents(events);
  } catch (error) { if (process.env.NODE_ENV !== 'test') console.error('Lead event ingestion failed', error); }
  return lead;
}

export async function recordProductEvent(name, eventId, userId, req, properties = {}) {
  if (!analyticsAllowed(req)) return;
  const { visitorId, sessionId } = readAnalyticsIds(req);
  const visitor = visitorId ? await AnalyticsVisitor.findOne({ visitorId, user: userId }) : null;
  const row = { eventId, name, user: userId, ...(visitor ? { visitorId, sessionId } : {}), source: 'server', path: req.path, properties, occurredAt: new Date(), ...(visitor ? { attribution: snapshot(visitor) } : {}) };
  const result = await AnalyticsEvent.updateOne({ eventId }, { $setOnInsert: row }, { upsert: true });
  if (result.upsertedCount) void dispatchAnalyticsEvents([row]);
}

export async function linkLeadConversion(activationLinkId, userId) {
  const lead = await AnalyticsLead.findOneAndUpdate({ activationLink: activationLinkId, status: { $ne: 'CONVERTED' } }, { $set: { status: 'CONVERTED', user: userId, convertedAt: new Date() } }, { new: true });
  if (!lead) return null;
  const visitor = await AnalyticsVisitor.findOne({ visitorId: lead.visitorId });
  if (visitor && !visitor.user) {
    await AnalyticsVisitor.updateOne({ _id: visitor._id, user: null }, { $set: { user: userId } });
    await Promise.all([
      AnalyticsSession.updateMany({ visitorId: lead.visitorId, user: null }, { $set: { user: userId } }),
      AnalyticsEvent.updateMany({ visitorId: lead.visitorId, user: null }, { $set: { user: userId } }),
    ]);
  }
  return lead;
}
