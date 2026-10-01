import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AnalyticsVisitor } from '../models/AnalyticsVisitor.js';
import { AnalyticsSession } from '../models/AnalyticsSession.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { AnalyticsLead } from '../models/AnalyticsLead.js';
import { CONVERSIONS, EVENTS, FUNNEL } from '../analytics/events.js';

const dimensions = { channel: 'channel', source: 'utmSource', medium: 'utmMedium', campaign: 'utmCampaign', content: 'utmContent', term: 'utmTerm', id: 'utmId', referrer: 'referrerHost', landing: 'landingPath' };
const filters = { source: 'utmSource', medium: 'utmMedium', campaign: 'utmCampaign', content: 'utmContent', term: 'utmTerm', id: 'utmId', channel: 'channel' };
const query = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), source: z.string().max(160).optional(), medium: z.string().max(160).optional(), campaign: z.string().max(160).optional(), content: z.string().max(160).optional(), term: z.string().max(160).optional(), id: z.string().max(160).optional(), channel: z.string().max(40).optional(), conversion: z.enum([...CONVERSIONS]).optional(), event: z.enum(Object.values(EVENTS)).optional(), model: z.enum(['firstTouch', 'lastTouch', 'lastNonDirectTouch']).default('lastTouch'), dimension: z.enum(Object.keys(dimensions)).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(30) }).refine((value) => !value.from || !value.to || value.from <= value.to);
const range = (q) => ({ $gte: q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86400000), $lt: q.to ? new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + 86400000) : new Date() });
function sessionMatch(q) {
  const match = { startedAt: range(q) };
  for (const [key, field] of Object.entries(filters)) if (q[key]) match[`attribution.${field}`] = q[key];
  return match;
}
const groupBy = (match, field) => AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: { value: `$attribution.${field}`, visitorId: '$visitorId' }, sessions: { $sum: 1 } } }, { $group: { _id: '$_id.value', sessions: { $sum: '$sessions' }, visitors: { $sum: 1 } } }, { $project: { _id: 0, value: { $ifNull: ['$_id', '(none)'] }, sessions: 1, visitors: 1 } }, { $sort: { sessions: -1 } }, { $limit: 100 }]);
const distinctCount = async (Model, match, field) => (await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}` } }, { $count: 'total' }]))[0]?.total || 0;
function eventMatch(q, names) {
  const match = { occurredAt: range(q), ...(names ? { name: { $in: names } } : {}) };
  for (const [key, field] of Object.entries(filters)) if (q[key]) match[`attribution.${q.model}.${field}`] = q[key];
  return match;
}
function leadMatch(q) {
  const match = { createdAt: range(q) };
  for (const [key, field] of Object.entries(filters)) if (q[key]) match[`${q.model}.${field}`] = q[key];
  return match;
}
const publicTouch = (touch) => touch ? Object.fromEntries(['channel', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm', 'utmId', 'referrerHost', 'landingPath', 'occurredAt'].map((key) => [key, touch[key]])) : null;
const eventRow = (row) => ({ eventId: row.eventId, name: row.name, visitorId: row.visitorId, sessionId: row.sessionId, userId: row.user ? String(row.user) : null, source: row.source, path: row.path, occurredAt: row.occurredAt, attribution: { firstTouch: publicTouch(row.attribution?.firstTouch), lastTouch: publicTouch(row.attribution?.lastTouch), lastNonDirectTouch: publicTouch(row.attribution?.lastNonDirectTouch) } });
const dimensionValue = (field) => ({ $ifNull: [`$${field}`, '(none)'] });
async function groupedCounts(Model, match, field, uniqueField) {
  const pipeline = [{ $match: match }, { $group: { _id: { value: dimensionValue(field), identity: `$${uniqueField}` } } }, { $group: { _id: '$_id.value', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 100 }];
  return Model.aggregate(pipeline);
}
function filledTimeline(period, unit, rows, empty) {
  const byTime = new Map(rows.map((row) => [new Date(row.at).toISOString(), row]));
  const cursor = new Date(period.$gte);
  cursor.setUTCHours(unit === 'hour' ? cursor.getUTCHours() : 0, 0, 0, 0);
  if (unit === 'week') cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());
  const end = Math.min(period.$lt.getTime(), Date.now() + 1);
  const points = [];
  while (cursor.getTime() < end && points.length <= 367) {
    const at = cursor.toISOString();
    points.push(byTime.get(at) || { at, ...empty });
    if (unit === 'hour') cursor.setUTCHours(cursor.getUTCHours() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (unit === 'week' ? 7 : 1));
  }
  return points;
}

export const adminAnalyticsRoutes = Router();
adminAnalyticsRoutes.use(adminAuth, (req, res, next) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(422).json({ success: false, message: 'Validation failed', errors: parsed.error.flatten().fieldErrors });
  req.analyticsQuery = parsed.data;
  next();
});
adminAnalyticsRoutes.get('/overview', asyncHandler(async (req, res) => {
  const match = sessionMatch(req.analyticsQuery);
  const [sessions, visitors, newVisitors, leads, registrations, activations, convertedVisitors, channels, landingPages] = await Promise.all([
    AnalyticsSession.countDocuments(match), distinctCount(AnalyticsSession, match, 'visitorId'),
    AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$visitorId' } }, { $lookup: { from: 'analyticsvisitors', localField: '_id', foreignField: 'visitorId', as: 'visitor' } }, { $unwind: '$visitor' }, { $match: { 'visitor.firstSeenAt': range(req.analyticsQuery) } }, { $count: 'total' }]).then((rows) => rows[0]?.total || 0),
    AnalyticsLead.countDocuments(leadMatch(req.analyticsQuery)),
    AnalyticsEvent.countDocuments(eventMatch(req.analyticsQuery, ['registration_completed'])),
    AnalyticsEvent.countDocuments(eventMatch(req.analyticsQuery, req.analyticsQuery.conversion ? [req.analyticsQuery.conversion] : ['access_activated'])),
    distinctCount(AnalyticsEvent, eventMatch(req.analyticsQuery, req.analyticsQuery.conversion ? [req.analyticsQuery.conversion] : ['access_activated']), 'visitorId'),
    groupBy(match, 'channel'), AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$landingPath', sessions: { $sum: 1 } } }, { $sort: { sessions: -1 } }, { $limit: 20 }]),
  ]);
  return success(res, { visitors, sessions, newVisitors, returningVisitors: Math.max(0, visitors - newVisitors), leads, registrations, conversions: activations, conversionRate: visitors ? convertedVisitors / visitors : 0, channels, landingPages });
}));
adminAnalyticsRoutes.get('/trend', asyncHandler(async (req, res) => {
  const q = req.analyticsQuery;
  const period = range(q);
  if (period.$lt - period.$gte > 366 * 86400000) return res.status(422).json({ success: false, message: 'Trend range must be 366 days or less' });
  const unit = period.$lt - period.$gte <= 2 * 86400000 ? 'hour' : period.$lt - period.$gte > 90 * 86400000 ? 'week' : 'day';
  const bucket = (field) => ({ $dateTrunc: { date: `$${field}`, unit, timezone: 'UTC' } });
  const counts = (Model, match, dateField, identityField) => Model.aggregate([{ $match: match }, { $group: { _id: { at: bucket(dateField), identity: `$${identityField}` }, count: { $sum: 1 } } }, { $group: { _id: '$_id.at', count: { $sum: '$count' }, unique: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const [sessions, leads, conversions] = await Promise.all([
    counts(AnalyticsSession, sessionMatch(q), 'startedAt', 'visitorId'),
    counts(AnalyticsLead, leadMatch(q), 'createdAt', 'visitorId'),
    counts(AnalyticsEvent, eventMatch(q, q.conversion ? [q.conversion] : ['access_activated']), 'occurredAt', 'visitorId'),
  ]);
  const points = new Map();
  for (const [key, rows] of Object.entries({ sessions, leads, conversions })) for (const row of rows) {
    const at = row._id.toISOString();
    const point = points.get(at) || { at, sessions: 0, visitors: 0, leads: 0, conversions: 0 };
    point[key] = row.count;
    if (key === 'sessions') point.visitors = row.unique;
    points.set(at, point);
  }
  return success(res, { unit, points: filledTimeline(period, unit, [...points.values()], { sessions: 0, visitors: 0, leads: 0, conversions: 0 }) });
}));
adminAnalyticsRoutes.get('/performance', asyncHandler(async (req, res) => {
  const q = req.analyticsQuery;
  const dimension = q.dimension || 'channel';
  const field = dimensions[dimension];
  const touchField = `attribution.${q.model}.${field}`;
  const trafficField = dimension === 'landing' ? 'landingPath' : `attribution.${field}`;
  const [traffic, leads, registrations, conversions] = await Promise.all([
    AnalyticsSession.aggregate([{ $match: sessionMatch(q) }, { $group: { _id: { value: dimensionValue(trafficField), visitorId: '$visitorId' }, sessions: { $sum: 1 } } }, { $group: { _id: '$_id.value', visitors: { $sum: 1 }, sessions: { $sum: '$sessions' } } }, { $sort: { sessions: -1 } }, { $limit: 100 }]),
    groupedCounts(AnalyticsLead, leadMatch(q), `${q.model}.${field}`, 'visitorId'),
    groupedCounts(AnalyticsEvent, eventMatch(q, ['registration_completed']), touchField, 'visitorId'),
    groupedCounts(AnalyticsEvent, eventMatch(q, q.conversion ? [q.conversion] : ['access_activated']), touchField, 'visitorId'),
  ]);
  const rows = new Map();
  for (const [kind, items] of Object.entries({ traffic, leads, registrations, conversions })) for (const item of items) {
    const value = String(item._id || '(none)');
    const row = rows.get(value) || { value, visitors: 0, sessions: 0, leads: 0, registrations: 0, conversions: 0 };
    if (kind === 'traffic') { row.visitors = item.visitors; row.sessions = item.sessions; }
    else row[kind] = item.count;
    rows.set(value, row);
  }
  return success(res, { dimension, model: q.model, rows: [...rows.values()].sort((a, b) => b.sessions - a.sessions || b.conversions - a.conversions).slice(0, 100) });
}));
adminAnalyticsRoutes.get('/source-quality', asyncHandler(async (req, res) => {
  const q = req.analyticsQuery;
  const rows = await AnalyticsEvent.aggregate([
    { $match: { ...eventMatch(q, ['registration_completed']), user: { $ne: null } } },
    { $lookup: { from: 'analyticsevents', let: { user: '$user', registered: '$occurredAt' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$user', '$$user'] }, { $eq: ['$name', 'access_activated'] }, { $gte: ['$occurredAt', '$$registered'] }] } } }, { $limit: 1 },
    ], as: 'activation' } },
    { $lookup: { from: 'analyticsevents', let: { user: '$user', registered: '$occurredAt' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$user', '$$user'] }, { $in: ['$name', ['task_created', 'project_created']] }, { $gte: ['$occurredAt', '$$registered'] }] } } }, { $limit: 1 },
    ], as: 'firstValue' } },
    { $group: { _id: { $ifNull: [`$attribution.${q.model}.utmSource`, '(none)'] }, registrations: { $sum: 1 }, activated: { $sum: { $cond: [{ $gt: [{ $size: '$activation' }, 0] }, 1, 0] } }, reachedFirstValue: { $sum: { $cond: [{ $gt: [{ $size: '$firstValue' }, 0] }, 1, 0] } } } },
    { $sort: { registrations: -1 } }, { $limit: 100 },
  ]);
  return success(res, { model: q.model, rows: rows.map((row) => ({ value: row._id, registrations: row.registrations, activated: row.activated, reachedFirstValue: row.reachedFirstValue, activationRate: row.registrations ? row.activated / row.registrations : 0 })) });
}));
adminAnalyticsRoutes.get('/acquisition', asyncHandler(async (req, res) => success(res, { channels: await groupBy(sessionMatch(req.analyticsQuery), 'channel'), sources: await groupBy(sessionMatch(req.analyticsQuery), 'utmSource'), mediums: await groupBy(sessionMatch(req.analyticsQuery), 'utmMedium') })));
adminAnalyticsRoutes.get('/campaigns', asyncHandler(async (req, res) => success(res, { campaigns: await groupBy(sessionMatch(req.analyticsQuery), 'utmCampaign'), creative: await groupBy(sessionMatch(req.analyticsQuery), 'utmContent') })));
adminAnalyticsRoutes.get('/funnel', asyncHandler(async (req, res) => {
  const viewed = { $ne: ['$timeline.page_viewed', null] };
  const registered = { $and: [viewed, { $ne: ['$timeline.registration_completed', null] }, { $gte: ['$timeline.registration_completed', '$timeline.page_viewed'] }] };
  const activated = { $and: [registered, { $ne: ['$timeline.access_activated', null] }, { $gte: ['$timeline.access_activated', '$timeline.registration_completed'] }] };
  const [counts] = await AnalyticsEvent.aggregate([
    { $match: { ...eventMatch(req.analyticsQuery, FUNNEL), visitorId: { $exists: true } } },
    { $group: { _id: { visitorId: '$visitorId', name: '$name' }, firstAt: { $min: '$occurredAt' } } },
    { $group: { _id: '$_id.visitorId', pairs: { $push: { k: '$_id.name', v: '$firstAt' } } } },
    { $project: { timeline: { $arrayToObject: '$pairs' } } },
    { $group: { _id: null, page_viewed: { $sum: { $cond: [viewed, 1, 0] } }, registration_completed: { $sum: { $cond: [registered, 1, 0] } }, access_activated: { $sum: { $cond: [activated, 1, 0] } } } },
  ]);
  const steps = FUNNEL.map((name) => ({ name, count: counts?.[name] || 0 }));
  return success(res, { steps });
}));
adminAnalyticsRoutes.get('/events', asyncHandler(async (req, res) => {
  const match = eventMatch(req.analyticsQuery, req.analyticsQuery.event ? [req.analyticsQuery.event] : req.analyticsQuery.conversion ? [req.analyticsQuery.conversion] : null);
  const [rows, total] = await Promise.all([AnalyticsEvent.find(match).select('eventId name visitorId sessionId user source path occurredAt attribution').sort({ occurredAt: -1 }).skip((req.analyticsQuery.page - 1) * req.analyticsQuery.limit).limit(req.analyticsQuery.limit).lean(), AnalyticsEvent.countDocuments(match)]);
  return success(res, rows.map(eventRow), 200, { pagination: { page: req.analyticsQuery.page, limit: req.analyticsQuery.limit, total } });
}));
adminAnalyticsRoutes.get('/event-trend', asyncHandler(async (req, res) => {
  if (!req.analyticsQuery.event) return res.status(422).json({ success: false, message: 'Event type is required' });
  const period = range(req.analyticsQuery);
  if (period.$lt - period.$gte > 366 * 86400000) return res.status(422).json({ success: false, message: 'Trend range must be 366 days or less' });
  const unit = period.$lt - period.$gte <= 2 * 86400000 ? 'hour' : period.$lt - period.$gte > 90 * 86400000 ? 'week' : 'day';
  const rows = await AnalyticsEvent.aggregate([{ $match: eventMatch(req.analyticsQuery, [req.analyticsQuery.event]) }, { $group: { _id: { $dateTrunc: { date: '$occurredAt', unit, timezone: 'UTC' } }, events: { $sum: 1 } } }, { $sort: { _id: 1 } }, { $limit: 366 }]);
  return success(res, { unit, points: filledTimeline(period, unit, rows.map((row) => ({ at: row._id, events: row.events })), { events: 0 }) });
}));
adminAnalyticsRoutes.get('/event-summary', asyncHandler(async (req, res) => {
  const [facet] = await AnalyticsEvent.aggregate([{ $match: eventMatch(req.analyticsQuery, req.analyticsQuery.conversion ? [req.analyticsQuery.conversion] : null) }, { $facet: {
    counts: [{ $group: { _id: '$name', count: { $sum: 1 } } }],
    visitors: [{ $match: { visitorId: { $ne: null } } }, { $group: { _id: { name: '$name', visitorId: '$visitorId' } } }, { $group: { _id: '$_id.name', count: { $sum: 1 } } }],
    users: [{ $match: { user: { $ne: null } } }, { $group: { _id: { name: '$name', user: '$user' } } }, { $group: { _id: '$_id.name', count: { $sum: 1 } } }],
  } }]);
  const visitors = new Map(facet.visitors.map((row) => [row._id, row.count]));
  const users = new Map(facet.users.map((row) => [row._id, row.count]));
  return success(res, facet.counts.map((row) => ({ name: row._id, count: row.count, visitors: visitors.get(row._id) || 0, users: users.get(row._id) || 0 })).sort((a, b) => b.count - a.count).slice(0, 100));
}));
adminAnalyticsRoutes.get('/conversions', asyncHandler(async (req, res) => {
  const match = eventMatch(req.analyticsQuery, req.analyticsQuery.conversion ? [req.analyticsQuery.conversion] : ['access_activated']);
  const facets = Object.fromEntries(['firstTouch', 'lastTouch', 'lastNonDirectTouch'].map((kind) => [kind, [
    { $group: { _id: `$attribution.${kind}.channel`, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]]));
  const [byTouch, total, rows] = await Promise.all([
    AnalyticsEvent.aggregate([{ $match: match }, { $facet: facets }]),
    AnalyticsEvent.countDocuments(match),
    AnalyticsEvent.find(match).select('eventId name visitorId sessionId user source path occurredAt attribution').sort({ occurredAt: -1 }).skip((req.analyticsQuery.page - 1) * req.analyticsQuery.limit).limit(req.analyticsQuery.limit).lean(),
  ]);
  return success(res, { total, attribution: byTouch[0], rows: rows.map(eventRow), pagination: { page: req.analyticsQuery.page, limit: req.analyticsQuery.limit, total } });
}));
adminAnalyticsRoutes.get('/conversions/:eventId/journey', asyncHandler(async (req, res) => {
  if (!/^[A-Za-z0-9:_-]{1,160}$/.test(req.params.eventId)) return res.status(422).json({ success: false, message: 'Invalid event ID' });
  const conversion = await AnalyticsEvent.findOne({ eventId: req.params.eventId, name: { $in: [...CONVERSIONS] } }).select('eventId name visitorId sessionId user source path occurredAt attribution').lean();
  if (!conversion) return res.status(404).json({ success: false, message: 'Conversion not found' });
  const visitorId = conversion.visitorId;
  if (!visitorId) return success(res, { conversion: eventRow(conversion), visitor: null, sessions: [], events: [], leads: [] });
  const [visitor, sessions, events, leads] = await Promise.all([
    AnalyticsVisitor.findOne({ visitorId }).select('visitorId user firstSeenAt lastSeenAt firstTouch lastTouch lastNonDirectTouch').lean(),
    AnalyticsSession.find({ visitorId, startedAt: { $lte: conversion.occurredAt } }).select('sessionId startedAt lastActivityAt landingPath attribution').sort({ startedAt: -1 }).limit(20).lean(),
    AnalyticsEvent.find({ visitorId, occurredAt: { $lte: conversion.occurredAt } }).select('eventId name occurredAt path sessionId source').sort({ occurredAt: -1 }).limit(60).lean(),
    AnalyticsLead.find({ visitorId, createdAt: { $lte: conversion.occurredAt } }).select('leadCode status source sessionId createdAt convertedAt').sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return success(res, { conversion: eventRow(conversion), visitor: visitor ? { visitorId, userId: visitor.user ? String(visitor.user) : null, firstSeenAt: visitor.firstSeenAt, lastSeenAt: visitor.lastSeenAt, firstTouch: publicTouch(visitor.firstTouch), lastTouch: publicTouch(visitor.lastTouch), lastNonDirectTouch: publicTouch(visitor.lastNonDirectTouch) } : null, sessions: sessions.reverse().map((row) => ({ sessionId: row.sessionId, startedAt: row.startedAt, lastActivityAt: row.lastActivityAt, landingPath: row.landingPath, attribution: publicTouch(row.attribution) })), events: events.reverse().map((row) => ({ eventId: row.eventId, name: row.name, occurredAt: row.occurredAt, path: row.path, sessionId: row.sessionId, source: row.source })), leads: leads.reverse() });
}));
adminAnalyticsRoutes.get('/visitors', asyncHandler(async (req, res) => {
  const q = req.analyticsQuery;
  const match = { firstSeenAt: range(q) };
  for (const [key, field] of Object.entries(filters)) if (q[key]) match[`${q.model}.${field}`] = q[key];
  const [visitors, total] = await Promise.all([
    AnalyticsVisitor.find(match).select('visitorId user firstSeenAt lastSeenAt firstTouch lastTouch lastNonDirectTouch').sort({ firstSeenAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AnalyticsVisitor.countDocuments(match),
  ]);
  const ids = visitors.map((visitor) => visitor.visitorId);
  const [sessionCounts, eventCounts, converted] = ids.length ? await Promise.all([
    AnalyticsSession.aggregate([{ $match: { visitorId: { $in: ids } } }, { $group: { _id: '$visitorId', count: { $sum: 1 } } }]),
    AnalyticsEvent.aggregate([{ $match: { visitorId: { $in: ids } } }, { $group: { _id: '$visitorId', count: { $sum: 1 } } }]),
    AnalyticsEvent.distinct('visitorId', { visitorId: { $in: ids }, name: 'access_activated' }),
  ]) : [[], [], []];
  const sessions = new Map(sessionCounts.map((row) => [row._id, row.count]));
  const events = new Map(eventCounts.map((row) => [row._id, row.count]));
  const convertedSet = new Set(converted);
  return success(res, visitors.map((row) => ({ visitorId: row.visitorId, userId: row.user ? String(row.user) : null, firstSeenAt: row.firstSeenAt, lastSeenAt: row.lastSeenAt, firstTouch: publicTouch(row.firstTouch), lastTouch: publicTouch(row.lastTouch), lastNonDirectTouch: publicTouch(row.lastNonDirectTouch), sessions: sessions.get(row.visitorId) || 0, events: events.get(row.visitorId) || 0, converted: convertedSet.has(row.visitorId) })), 200, { pagination: { page: q.page, limit: q.limit, total } });
}));
adminAnalyticsRoutes.get('/visitors/:visitorId/journey', asyncHandler(async (req, res) => {
  if (!z.uuid().safeParse(req.params.visitorId).success) return res.status(422).json({ success: false, message: 'Invalid visitor ID' });
  const visitor = await AnalyticsVisitor.findOne({ visitorId: req.params.visitorId }).select('visitorId user firstSeenAt lastSeenAt firstTouch lastTouch lastNonDirectTouch').lean();
  if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
  const [sessions, events, leads] = await Promise.all([
    AnalyticsSession.find({ visitorId: visitor.visitorId }).select('sessionId startedAt lastActivityAt landingPath attribution').sort({ startedAt: -1 }).limit(20).lean(),
    AnalyticsEvent.find({ visitorId: visitor.visitorId }).select('eventId name occurredAt path sessionId source').sort({ occurredAt: -1 }).limit(60).lean(),
    AnalyticsLead.find({ visitorId: visitor.visitorId }).select('leadCode status source sessionId createdAt convertedAt').sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  return success(res, { visitor: { visitorId: visitor.visitorId, userId: visitor.user ? String(visitor.user) : null, firstSeenAt: visitor.firstSeenAt, lastSeenAt: visitor.lastSeenAt, firstTouch: publicTouch(visitor.firstTouch), lastTouch: publicTouch(visitor.lastTouch), lastNonDirectTouch: publicTouch(visitor.lastNonDirectTouch) }, sessions: sessions.reverse().map((row) => ({ sessionId: row.sessionId, startedAt: row.startedAt, lastActivityAt: row.lastActivityAt, landingPath: row.landingPath, attribution: publicTouch(row.attribution) })), events: events.reverse(), leads: leads.reverse() });
}));
adminAnalyticsRoutes.get('/sessions', asyncHandler(async (req, res) => {
  const q = req.analyticsQuery;
  const match = sessionMatch(q);
  const [sessions, total] = await Promise.all([
    AnalyticsSession.find(match).select('sessionId visitorId user startedAt lastActivityAt landingPath attribution deviceCategory').sort({ startedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AnalyticsSession.countDocuments(match),
  ]);
  const ids = sessions.map((row) => row.sessionId);
  const counts = ids.length ? await AnalyticsEvent.aggregate([{ $match: { sessionId: { $in: ids } } }, { $group: { _id: '$sessionId', events: { $sum: 1 }, converted: { $max: { $cond: [{ $eq: ['$name', 'access_activated'] }, 1, 0] } } } }]) : [];
  const byId = new Map(counts.map((row) => [row._id, row]));
  return success(res, sessions.map((row) => ({ sessionId: row.sessionId, visitorId: row.visitorId, userId: row.user ? String(row.user) : null, startedAt: row.startedAt, lastActivityAt: row.lastActivityAt, landingPath: row.landingPath, attribution: publicTouch(row.attribution), deviceCategory: row.deviceCategory, events: byId.get(row.sessionId)?.events || 0, converted: Boolean(byId.get(row.sessionId)?.converted) })), 200, { pagination: { page: q.page, limit: q.limit, total } });
}));
adminAnalyticsRoutes.get('/leads', asyncHandler(async (req, res) => {
  const match = leadMatch(req.analyticsQuery);
  const [rows, total] = await Promise.all([AnalyticsLead.find(match).sort({ createdAt: -1 }).skip((req.analyticsQuery.page - 1) * req.analyticsQuery.limit).limit(req.analyticsQuery.limit).lean(), AnalyticsLead.countDocuments(match)]);
  return success(res, rows, 200, { pagination: { page: req.analyticsQuery.page, limit: req.analyticsQuery.limit, total } });
}));
adminAnalyticsRoutes.get('/retention', asyncHandler(async (req, res) => {
  const cohortRange = range(req.analyticsQuery);
  cohortRange.$lt = new Date(Math.min(cohortRange.$lt.getTime(), Date.now() - 14 * 86400000));
  const cohort = { firstSeenAt: cohortRange };
  for (const [key, field] of Object.entries(filters)) if (req.analyticsQuery[key]) cohort[`${req.analyticsQuery.model}.${field}`] = req.analyticsQuery[key];
  const rows = await AnalyticsVisitor.aggregate([
    { $match: cohort },
    { $lookup: { from: 'analyticssessions', let: { visitor: '$visitorId', first: '$firstSeenAt' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$visitorId', '$$visitor'] }, { $gte: ['$startedAt', { $add: ['$$first', 7 * 86400000] }] }, { $lt: ['$startedAt', { $add: ['$$first', 14 * 86400000] }] }] } } },
      { $limit: 1 },
    ], as: 'returnVisits' } },
    { $group: { _id: { $dateTrunc: { date: '$firstSeenAt', unit: 'week', timezone: 'UTC' } }, cohortVisitors: { $sum: 1 }, retainedVisitors: { $sum: { $cond: [{ $gt: [{ $size: '$returnVisits' }, 0] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const cohortVisitors = rows.reduce((sum, row) => sum + row.cohortVisitors, 0);
  const retainedVisitors = rows.reduce((sum, row) => sum + row.retainedVisitors, 0);
  return success(res, { cohortVisitors, retainedVisitors, sevenDayRetentionRate: cohortVisitors ? retainedVisitors / cohortVisitors : 0, cohorts: rows.map((row) => ({ week: row._id, visitors: row.cohortVisitors, retained: row.retainedVisitors, rate: row.cohortVisitors ? row.retainedVisitors / row.cohortVisitors : 0 })) });
}));
adminAnalyticsRoutes.get('/product', asyncHandler(async (req, res) => {
  const cohortMatch = eventMatch(req.analyticsQuery, ['registration_completed']);
  const [cohort] = await AnalyticsEvent.aggregate([
    { $match: cohortMatch },
    { $lookup: { from: 'analyticsevents', let: { user: '$user', registered: '$occurredAt' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$user', '$$user'] }, { $gte: ['$occurredAt', '$$registered'] }, { $in: ['$name', ['task_created', 'project_created']] }] } } },
      { $sort: { occurredAt: 1 } }, { $limit: 1 },
    ], as: 'firstValue' } },
    { $lookup: { from: 'analyticsevents', let: { user: '$user' }, pipeline: [
      { $match: { $expr: { $and: [{ $eq: ['$user', '$$user'] }, { $eq: ['$name', 'access_activated'] }] } } }, { $limit: 1 },
    ], as: 'activation' } },
    { $group: { _id: null, registrations: { $sum: 1 }, activated: { $sum: { $cond: [{ $gt: [{ $size: '$activation' }, 0] }, 1, 0] } },
      reachedFirstValue: { $sum: { $cond: [{ $gt: [{ $size: '$firstValue' }, 0] }, 1, 0] } },
      averageTimeToFirstValueMs: { $avg: { $cond: [{ $gt: [{ $size: '$firstValue' }, 0] }, { $subtract: [{ $first: '$firstValue.occurredAt' }, '$occurredAt'] }, null] } } } },
  ]);
  const adoption = await AnalyticsEvent.aggregate([
    { $match: eventMatch(req.analyticsQuery, ['task_created', 'task_completed', 'project_created']) },
    { $group: { _id: { name: '$name', user: '$user' } } },
    { $group: { _id: '$_id.name', users: { $sum: 1 } } },
    { $sort: { users: -1 } },
  ]);
  const registrations = cohort?.registrations || 0;
  return success(res, { registrations, activationRate: registrations ? cohort.activated / registrations : 0, reachedFirstValue: cohort?.reachedFirstValue || 0, averageTimeToFirstValueMs: cohort?.averageTimeToFirstValueMs || null, adoption });
}));

