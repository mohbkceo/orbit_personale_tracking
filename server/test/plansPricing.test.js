import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Admin } from '../src/models/Admin.js';
import { Feature } from '../src/models/Feature.js';
import { Plan } from '../src/models/Plan.js';
import { env } from '../src/config/env.js';

let mongo;
let cookie;
const admin = () => request(app);
const authorized = (call) => call.set('Cookie', cookie);
const featureBody = (overrides = {}) => ({ key: 'smart-reminders', name: 'Smart Reminders', description: 'Timely prompts', category: 'Productivity', icon: 'solar:bell-bold', type: 'BOOLEAN', publicVisible: true, order: 2, status: 'ACTIVE', ...overrides });
const planBody = (overrides = {}) => ({ name: 'Starter', slug: 'starter', durationValue: 1, durationUnit: 'MONTH', price: { amount: 10, originalAmount: 15, currency: 'USD', suffix: '/ month' }, appearance: { icon: 'tabler:target', color: '#173d30', textColor: '#ffffff', badge: 'Popular', highlighted: true }, public: { visible: true, order: 2, ctaText: 'Join now', shortDescription: 'Start tracking' }, ...overrides });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await Promise.all([Admin.init(), Feature.init(), Plan.init()]);
});
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Feature.deleteMany(), Plan.deleteMany(), Admin.deleteMany()]);
  const owner = await Admin.create({ fullName: 'Plan Admin', email: 'plans@example.com', passwordHash: 'unused', role: 'ADMIN' });
  cookie = `orbit_admin=${jwt.sign({ sub: String(owner._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
});

describe('feature catalog and pricing plans', () => {
  it('blocks unauthenticated feature and plan administration', async () => {
    await admin().get('/api/admin/features').expect(401);
    await admin().post('/api/admin/features').send(featureBody()).expect(401);
    await admin().patch('/api/admin/features/507f1f77bcf86cd799439011').send({ status: 'INACTIVE' }).expect(401);
    await admin().delete('/api/admin/features/507f1f77bcf86cd799439011').expect(401);
    await admin().get('/api/admin/plans').expect(401);
    await admin().post('/api/admin/plans').send(planBody()).expect(401);
    await admin().patch('/api/admin/plans/507f1f77bcf86cd799439011').send({ status: 'INACTIVE' }).expect(401);
  });

  it('creates, lists, edits, and deactivates catalog features while preserving Iconify IDs', async () => {
    const created = await authorized(admin().post('/api/admin/features')).send(featureBody()).expect(201);
    const id = created.body.data._id;
    expect(created.body.data.icon).toBe('solar:bell-bold');
    expect((await authorized(admin().get('/api/admin/features')).expect(200)).body.data).toHaveLength(1);
    const changed = await authorized(admin().patch(`/api/admin/features/${id}`)).send({ name: 'Telegram Alerts', icon: 'simple-icons:telegram', order: 0, status: 'INACTIVE' }).expect(200);
    expect(changed.body.data).toMatchObject({ name: 'Telegram Alerts', icon: 'simple-icons:telegram', order: 0, status: 'INACTIVE' });
    await authorized(admin().post('/api/admin/features')).send(featureBody()).expect(409);
    await authorized(admin().post('/api/admin/features')).send(featureBody({ key: 'other', icon: '<svg onload=alert(1)>' })).expect(422);
    await authorized(admin().delete(`/api/admin/features/${id}`)).expect(200);
    expect((await authorized(admin().get('/api/admin/features')).expect(200)).body.data).toHaveLength(0);
  });

  it('creates and updates plans with catalog entitlements and rejects invalid types or arbitrary keys', async () => {
    const boolean = (await authorized(admin().post('/api/admin/features')).send(featureBody()).expect(201)).body.data;
    const limited = (await authorized(admin().post('/api/admin/features')).send(featureBody({ key: 'projects', name: 'Projects', icon: 'tabler:target', type: 'LIMIT' })).expect(201)).body.data;
    const text = (await authorized(admin().post('/api/admin/features')).send(featureBody({ key: 'support', name: 'Support', icon: 'mdi:telegram', type: 'TEXT' })).expect(201)).body.data;
    await authorized(admin().post('/api/admin/plans')).send(planBody({ slug: 'bad-limit', features: [{ feature: limited._id, enabled: true }] })).expect(422);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ slug: 'bad-text', features: [{ feature: text._id, enabled: true, value: '' }] })).expect(422);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ slug: 'unknown', features: [{ feature: '507f1f77bcf86cd799439011', enabled: true }] })).expect(422);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ slug: 'invalid-price', price: { amount: -1 } })).expect(422);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ slug: 'invalid-color', appearance: { color: 'red' } })).expect(422);
    const created = await authorized(admin().post('/api/admin/plans')).send(planBody({ features: [{ feature: boolean._id, enabled: true }, { feature: limited._id, enabled: true, limit: 10 }, { feature: text._id, enabled: true, value: 'Priority' }] })).expect(201);
    expect(created.body.data.features).toHaveLength(3);
    const id = created.body.data._id;
    await authorized(admin().delete(`/api/admin/features/${boolean._id}`)).expect(409);
    const updated = await authorized(admin().patch(`/api/admin/plans/${id}`)).send({ price: { amount: 12 }, public: { order: 1 } }).expect(200);
    expect(updated.body.data.price).toMatchObject({ amount: 12, currency: 'USD' });
    expect(updated.body.data.public).toMatchObject({ order: 1, visible: true });
    await authorized(admin().post('/api/admin/plans')).send(planBody({ name: 'Duplicate', slug: 'starter' })).expect(409);
  });

  it('returns ordered, public-safe active plans and only enabled active public features', async () => {
    const publicFeature = (await authorized(admin().post('/api/admin/features')).send(featureBody()).expect(201)).body.data;
    const privateFeature = (await authorized(admin().post('/api/admin/features')).send(featureBody({ key: 'private', publicVisible: false })).expect(201)).body.data;
    const inactiveFeature = (await authorized(admin().post('/api/admin/features')).send(featureBody({ key: 'inactive', status: 'INACTIVE' })).expect(201)).body.data;
    await authorized(admin().post('/api/admin/plans')).send(planBody({ name: 'Second', slug: 'second', public: { visible: true, order: 2 }, features: [{ feature: publicFeature._id, enabled: true }, { feature: privateFeature._id, enabled: true }, { feature: inactiveFeature._id, enabled: true }] })).expect(201);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ name: 'First', slug: 'first', public: { visible: true, order: 1 } })).expect(201);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ name: 'Hidden', slug: 'hidden', public: { visible: false, order: 0 } })).expect(201);
    await authorized(admin().post('/api/admin/plans')).send(planBody({ name: 'Inactive', slug: 'inactive', status: 'INACTIVE', public: { visible: true, order: 0 } })).expect(201);
    const result = await admin().get('/api/public/plans').expect(200);
    expect(result.body.data.map((plan) => plan.slug)).toEqual(['first', 'second']);
    expect(result.body.data[1].appearance.icon).toBe('tabler:target');
    expect(result.body.data[1].features.map((feature) => feature.icon)).toEqual(['solar:bell-bold']);
    expect(JSON.stringify(result.body.data)).not.toContain('createdBy');
    expect(JSON.stringify(result.body.data)).not.toContain('status');
  });
});
