import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { AnalyticsVisitor } from '../src/models/AnalyticsVisitor.js';
import { AnalyticsSession } from '../src/models/AnalyticsSession.js';
import { AnalyticsEvent } from '../src/models/AnalyticsEvent.js';
import { AnalyticsLead } from '../src/models/AnalyticsLead.js';
import { parseAttribution, persistTouches } from '../src/analytics/attributionService.js';
import { recordServerEvent, linkLeadConversion } from '../src/analytics/analyticsService.js';
import { EVENTS } from '../src/analytics/events.js';

let mongo;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => { await Promise.all([AnalyticsVisitor.deleteMany(), AnalyticsSession.deleteMany(), AnalyticsEvent.deleteMany(), AnalyticsLead.deleteMany(), User.deleteMany(), Admin.deleteMany()]); });

const entry = (url = 'http://localhost:5173/?utm_source=meta&utm_medium=paid_social&fbclid=abc') => ({ landingUrl: url, referrer: '' });
const authCookie = (user) => `orbit_user=${jwt.sign({ sub: String(user._id), type: 'user' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;

describe('first-party analytics', () => {
  it('normalizes UTM and click IDs, classifies referrers, and refuses oversized or foreign landing data', () => {
    const origin = 'http://localhost:5173';
    const touch = parseAttribution({ landingUrl: `${origin}/?utm_source=Meta&utm_medium=paid_social&utm_campaign=Autumn&gclid=click`, referrer: 'https://google.com/search?q=secret' }, origin);
    expect(touch).toMatchObject({ channel: 'paid_search', utmSource: 'Meta', utmCampaign: 'Autumn', clickIds: { gclid: 'click' }, referrerHost: 'google.com' });
    expect(touch.referrer).not.toContain('secret');
    expect(parseAttribution({ landingUrl: `${origin}/?utm_source=${'x'.repeat(300)}` }, origin).utmSource).toBeUndefined();
    const foreign = parseAttribution({ landingUrl: 'https://evil.example/?utm_source=spam' }, origin);
    expect(foreign.channel).toBe('unknown');
    expect(foreign.utmSource).toBeUndefined();
    expect(parseAttribution({ landingUrl: `${origin}/`, referrer: 'https://www.google.com/search' }, origin).channel).toBe('organic_search');
    expect(parseAttribution({ landingUrl: `${origin}/?fbclid=share` }, origin).channel).toBe('organic_social');
    expect(parseAttribution({ landingUrl: `${origin}/?utm_source=facebook&utm_medium=cpc` }, origin).channel).toBe('paid_social');
    expect(parseAttribution({ landingUrl: `${origin}/activate/secret-token?utm_source=meta` }, origin).landingPath).toBe('/activate/:key');
  });

  it('preserves first and last non-direct touch across direct returns', async () => {
    const origin = 'http://localhost:5173';
    const at = Date.now();
    const meta = parseAttribution(entry(), origin, new Date(at));
    const google = parseAttribution({ landingUrl: `${origin}/`, referrer: 'https://google.com/search' }, origin, new Date(at + 1000));
    const direct = parseAttribution({ landingUrl: `${origin}/` }, origin, new Date(at + 2000));
    const visitor = await AnalyticsVisitor.create({ visitorId: randomUUID(), firstSeenAt: new Date(at), lastSeenAt: new Date(at) });
    await persistTouches(visitor, meta);
    await persistTouches(visitor, google);
    const third = await persistTouches(visitor, direct);
    expect(third.firstTouch.channel).toBe('paid_social');
    expect(third.lastTouch.channel).toBe('direct');
    expect(third.lastNonDirectTouch.channel).toBe('organic_search');
  });

  it('creates, reuses, and expires sessions without changing first touch', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/analytics/session').send(entry()).expect(200);
    const second = await agent.post('/api/analytics/session').send(entry('http://localhost:5173/pricing?utm_source=google')).expect(200);
    expect(second.body.data.sessionId).toBe(first.body.data.sessionId);
    await AnalyticsSession.updateOne({ sessionId: first.body.data.sessionId }, { $set: { lastActivityAt: new Date(Date.now() - 31 * 60_000) } });
    const third = await agent.post('/api/analytics/session').send(entry('http://localhost:5173/pricing')).expect(200);
    expect(third.body.data.sessionId).not.toBe(first.body.data.sessionId);
    expect(third.body.data.attribution.firstTouch.utmSource).toBe('meta');
    expect(third.body.data.attribution.lastTouch.channel).toBe('direct');
    expect(third.body.data.attribution.lastNonDirectTouch.channel).toBe('paid_social');
  });
  it('starts a new acquisition session for a genuinely different tagged entry', async () => {
    const agent = request.agent(app);
    const first = await agent.post('/api/analytics/session').send({ ...entry(), entry: true }).expect(200);
    const internal = await agent.post('/api/analytics/session').send({ ...entry('http://localhost:5173/pricing?utm_source=google'), referrer: 'http://localhost:5173/', entry: true }).expect(200);
    expect(internal.body.data.sessionId).toBe(first.body.data.sessionId);
    const next = await agent.post('/api/analytics/session').send({ landingUrl: 'http://localhost:5173/?utm_source=google&utm_medium=organic', referrer: 'https://google.com/search', entry: true }).expect(200);
    expect(next.body.data.sessionId).not.toBe(first.body.data.sessionId);
    expect(next.body.data.attribution.firstTouch.utmSource).toBe('meta');
    expect(next.body.data.attribution.lastTouch.utmSource).toBe('google');
  });

  it('validates batches, deduplicates event IDs, and links anonymous history after login', async () => {
    const agent = request.agent(app);
    const start = await agent.post('/api/analytics/session').send(entry()).expect(200);
    const event = { eventId: randomUUID(), name: EVENTS.PAGE_VIEWED, path: '/', occurredAt: new Date().toISOString(), properties: { section: 'hero' } };
    await agent.post('/api/analytics/events/batch').send({ events: [event, event] }).expect(200);
    expect(await AnalyticsEvent.countDocuments({ eventId: event.eventId })).toBe(1);
    await agent.post('/api/analytics/events/batch').send({ events: [{ ...event, eventId: randomUUID(), properties: { bad: 'x'.repeat(300) } }] }).expect(422);
    await agent.post('/api/analytics/events/batch').send({ events: Array.from({ length: 26 }, () => event) }).expect(422);
    await agent.post('/api/analytics/events/batch').send({ events: [{ ...event, name: 'purchase_completed' }] }).expect(422);
    const user = await User.create({ fullName: 'One', email: 'one@example.com', passwordHash: 'hash' });
    await agent.post('/api/analytics/session').set('Cookie', authCookie(user)).send(entry()).expect(200);
    expect((await AnalyticsVisitor.findOne({ visitorId: start.body.data.visitorId })).user.toString()).toBe(String(user._id));
    expect((await AnalyticsEvent.findOne({ eventId: event.eventId })).user.toString()).toBe(String(user._id));
    expect((await AnalyticsSession.findOne({ sessionId: start.body.data.sessionId })).user.toString()).toBe(String(user._id));
    const other = await User.create({ fullName: 'Two', email: 'two@example.com', passwordHash: 'hash' });
    const switched = await agent.post('/api/analytics/session').set('Cookie', authCookie(other)).send(entry()).expect(200);
    expect(switched.body.data.visitorId).not.toBe(start.body.data.visitorId);
  });

  it('records conversions once with attribution and preserves a WhatsApp lead bridge', async () => {
    const agent = request.agent(app);
    await agent.post('/api/analytics/session').send(entry()).expect(200);
    const leadResponse = await agent.post('/api/analytics/leads').send({}).expect(201);
    const lead = await AnalyticsLead.findOne({ leadCode: leadResponse.body.data.leadCode });
    expect(lead.firstTouch.channel).toBe('paid_social');
    const user = await User.create({ fullName: 'Buyer', email: 'buyer@example.com', passwordHash: 'hash' });
    const linked = new mongoose.Types.ObjectId();
    await AnalyticsLead.updateOne({ _id: lead._id }, { $set: { activationLink: linked } });
    const convertedLead = await linkLeadConversion(linked, user._id);
    expect(convertedLead.status).toBe('CONVERTED');
    const session = await AnalyticsSession.findOne({ sessionId: lead.sessionId });
    const visitor = await AnalyticsVisitor.findOne({ visitorId: lead.visitorId });
    const fakeReq = { cookies: {}, get: () => '', path: '/api/activation/test/activate' };
    const fakeRes = { cookie: () => {}, clearCookie: () => {} };
    // Simulate the activation request carrying the signed first-party cookies.
    fakeReq.cookies.orbit_visitor = jwt.sign({ sub: visitor.visitorId, type: 'visitor' }, env.AUTH_JWT_SECRET, { issuer: 'orbit-analytics', expiresIn: '1d' });
    fakeReq.cookies.orbit_analytics_session = jwt.sign({ sub: session.sessionId, type: 'session' }, env.AUTH_JWT_SECRET, { issuer: 'orbit-analytics', expiresIn: '1d' });
    const id = 'access:example';
    await recordServerEvent(EVENTS.ACCESS_ACTIVATED, id, user._id, fakeReq, fakeRes, { leadCode: lead.leadCode }, { firstTouch: lead.firstTouch, lastTouch: lead.lastTouch, lastNonDirectTouch: lead.lastNonDirectTouch });
    await recordServerEvent(EVENTS.ACCESS_ACTIVATED, id, user._id, fakeReq, fakeRes);
    const conversion = await AnalyticsEvent.findOne({ eventId: id });
    expect(conversion.attribution.firstTouch.channel).toBe('paid_social');
    expect(conversion.properties.leadCode).toBe(lead.leadCode);
    expect(await AnalyticsEvent.countDocuments({ eventId: id })).toBe(1);
  });

  it('protects admin reports and returns database-aggregated metrics', async () => {
    const agent = request.agent(app);
    await agent.post('/api/analytics/session').send(entry()).expect(200);
    await agent.post('/api/analytics/events/batch').send({ events: [{ eventId: randomUUID(), name: EVENTS.PAGE_VIEWED, path: '/', occurredAt: new Date().toISOString() }] }).expect(200);
    await request(app).get('/api/admin/analytics/overview').expect(401);
    const admin = await Admin.create({ fullName: 'Analyst', email: 'analyst@example.com', passwordHash: 'hash', role: 'ADMIN' });
    const cookie = `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
    const overview = await request(app).get('/api/admin/analytics/overview?source=meta').set('Cookie', cookie).expect(200);
    expect(overview.body.data).toMatchObject({ visitors: 1, sessions: 1, newVisitors: 1 });
    const funnel = await request(app).get('/api/admin/analytics/funnel?source=meta').set('Cookie', cookie).expect(200);
    expect(funnel.body.data.steps[0]).toEqual({ name: EVENTS.PAGE_VIEWED, count: 1 });
    await request(app).get('/api/admin/analytics/retention').set('Cookie', cookie).expect(200);
    await request(app).get('/api/admin/analytics/product').set('Cookie', cookie).expect(200);
    await request(app).get('/api/admin/analytics/overview?from=bad').set('Cookie', cookie).expect(422);
  });
  it('serves bounded admin trend, model-aware performance, journeys, and paginated explorers', async () => {
    const now = new Date();
    const visitorId = randomUUID();
    const sessionId = randomUUID();
    const firstTouch = { channel: 'paid_social', utmSource: 'Meta', utmCampaign: 'Launch', landingPath: '/', queryParams: { private: 'never expose' }, occurredAt: now };
    const lastTouch = { channel: 'direct', landingPath: '/pricing', occurredAt: now };
    const lastNonDirectTouch = { channel: 'organic_search', utmSource: 'Google', landingPath: '/', occurredAt: now };
    await AnalyticsVisitor.create({ visitorId, firstSeenAt: now, lastSeenAt: now, firstTouch, lastTouch, lastNonDirectTouch });
    await AnalyticsSession.create({ visitorId, sessionId, startedAt: now, lastActivityAt: now, landingPath: '/pricing', attribution: lastTouch });
    const customer = await User.create({ fullName: 'Customer', email: 'customer@example.com', passwordHash: 'hash' });
    await AnalyticsEvent.create({ eventId: `registration:${randomUUID()}`, name: EVENTS.REGISTRATION_COMPLETED, visitorId, sessionId, user: customer._id, source: 'server', occurredAt: new Date(now.getTime() - 1000), attribution: { firstTouch, lastTouch, lastNonDirectTouch } });
    await AnalyticsEvent.create({ eventId: `access:${randomUUID()}`, name: EVENTS.ACCESS_ACTIVATED, visitorId, sessionId, user: customer._id, source: 'server', occurredAt: now, properties: { secret: 'not in admin response' }, attribution: { firstTouch, lastTouch, lastNonDirectTouch } });
    const admin = await Admin.create({ fullName: 'Analyst', email: 'report@example.com', passwordHash: 'hash', role: 'ADMIN' });
    const cookie = `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
    const call = (path) => request(app).get(`/api/admin/analytics${path}`).set('Cookie', cookie);
    const first = await call('/performance?dimension=channel&model=firstTouch').expect(200);
    const last = await call('/performance?dimension=channel&model=lastTouch').expect(200);
    expect(first.body.data.rows.find((row) => row.value === 'paid_social').conversions).toBe(1);
    expect(last.body.data.rows.find((row) => row.value === 'direct').conversions).toBe(1);
    const quality = await call('/source-quality?model=firstTouch').expect(200);
    expect(quality.body.data.rows.find((row) => row.value === 'Meta')).toMatchObject({ registrations: 1, activated: 1, activationRate: 1 });
    const trend = await call('/trend').expect(200);
    expect(trend.body.data.points.find((point) => point.conversions === 1)).toMatchObject({ sessions: 1, visitors: 1, conversions: 1 });
    const conversions = await call('/conversions?limit=1').expect(200);
    expect(conversions.body.data.pagination.total).toBe(1);
    expect(conversions.body.data.rows[0].attribution.firstTouch.channel).toBe('paid_social');
    expect(JSON.stringify(conversions.body.data.rows[0])).not.toContain('private');
    const journey = await call(`/conversions/${encodeURIComponent(conversions.body.data.rows[0].eventId)}/journey`).expect(200);
    expect(journey.body.data.sessions).toHaveLength(1);
    expect(journey.body.data.events).toHaveLength(2);
    expect(JSON.stringify(journey.body.data)).not.toContain('secret');
    const visitors = await call('/visitors?limit=1').expect(200);
    expect(visitors.body.pagination.total).toBe(1);
    expect(visitors.body.data[0]).toMatchObject({ sessions: 1, events: 2, converted: true });
    const sessions = await call('/sessions?limit=1').expect(200);
    expect(sessions.body.data[0]).toMatchObject({ events: 2, converted: true });
    const summary = await call('/event-summary').expect(200);
    expect(summary.body.data.find((row) => row.name === EVENTS.ACCESS_ACTIVATED)).toMatchObject({ count: 1, visitors: 1 });
    const eventRows = await call(`/events?event=${EVENTS.ACCESS_ACTIVATED}`).expect(200);
    expect(eventRows.body.data).toHaveLength(1);
    expect(JSON.stringify(eventRows.body.data)).not.toContain('secret');
    const eventTrend = await call(`/event-trend?event=${EVENTS.ACCESS_ACTIVATED}`).expect(200);
    expect(eventTrend.body.data.points.some((point) => point.events === 1)).toBe(true);
    await call('/event-trend').expect(422);
    await call('/performance?dimension=unsupported').expect(422);
    await request(app).get('/api/admin/analytics/performance').expect(401);
  });
  it('requires explicit browser consent when the server consent gate is enabled', async () => {
    env.ANALYTICS_REQUIRE_CONSENT = true;
    try {
      const agent = request.agent(app);
      await agent.post('/api/analytics/session').send(entry()).expect(204);
      expect(await AnalyticsVisitor.countDocuments()).toBe(0);
      await agent.post('/api/analytics/consent').send({ granted: true }).expect(200);
      await agent.post('/api/analytics/session').send(entry()).expect(200);
      expect(await AnalyticsVisitor.countDocuments()).toBe(1);
      await agent.post('/api/analytics/opt-out').send({}).expect(200);
      await agent.post('/api/analytics/session').send(entry()).expect(204);
    } finally { env.ANALYTICS_REQUIRE_CONSENT = false; }
  });
});
