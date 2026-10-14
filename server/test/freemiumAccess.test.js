import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { ensureAccessCatalog } from '../src/services/accessCatalogSeed.js';
import { Admin } from '../src/models/Admin.js';
import { Plan } from '../src/models/Plan.js';
import { Feature } from '../src/models/Feature.js';
import { User } from '../src/models/User.js';
import { Account } from '../src/models/Account.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { AccessConfiguration } from '../src/models/AccessConfiguration.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { consumeTelegramLink } from '../src/services/telegramLinkService.js';
import { handleTelegramUpdate } from '../src/telegram/handler.js';

let mongo;
let adminAgent;
let member;
let account;
let paid;
const signup = { fullName: 'Free Member', email: 'free@example.com', password: 'very-long-free-password' };

beforeAll(async () => { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); vi.unstubAllGlobals(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([Admin.init(), User.init(), Plan.init(), Feature.init(), AccessSubscription.init(), TelegramConnection.init()]);
  await ensureAccessCatalog();
  const admin = await Admin.create({ fullName: 'Root', email: 'root@example.com', passwordHash: 'unused', role: 'SUPER_ADMIN' });
  adminAgent = request.agent(app);
  // Tests use the existing signed admin cookie rather than changing auth internals.
  const { default: jwt } = await import('jsonwebtoken');
  const { env } = await import('../src/config/env.js');
  adminAgent = { get: (path) => request(app).get(path).set('Cookie', `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`),
    patch: (path) => request(app).patch(path).set('Cookie', `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`) };
  const project = await Feature.findOne({ key: 'projects' });
  paid = await Plan.create({ name: 'Plus', slug: 'plus', durationValue: 1, durationUnit: 'MONTH', price: { amount: 500, currency: 'DZD' }, public: { visible: true }, features: [{ feature: project._id, enabled: true }], createdBy: admin._id });
  member = request.agent(app);
  await member.post('/api/auth/register').send(signup).expect(201);
  account = await User.findOne({ email: signup.email });
});

describe('Freemium access control', () => {
  it('migrates a legacy paid plan without generating a duplicate slug', async () => {
    const legacyFeature = await Feature.create({ key: 'accounts_transactions', name: 'Accounts and transactions', category: 'Finance', icon: 'mdi:wallet-outline', type: 'BOOLEAN' });
    const legacy = await Plan.collection.insertOne({ name: 'Plus', durationValue: 30, durationUnit: 'DAY', price: { amount: 500, currency: 'DZD' }, features: [{ feature: legacyFeature._id, enabled: true }], status: 'ACTIVE' });
    await AccessConfiguration.deleteOne({ key: 'global' });
    await ensureAccessCatalog();
    const migrated = await Plan.collection.findOne({ _id: legacy.insertedId });
    const accountFeature = await Feature.findOne({ key: 'accounts' });
    const transactionFeature = await Feature.findOne({ key: 'transactions' });
    expect(migrated.slug).toBeUndefined();
    expect(migrated.features.some((entry) => String(entry.feature) === String(accountFeature._id))).toBe(true);
    expect(migrated.features.some((entry) => String(entry.feature) === String(transactionFeature._id))).toBe(true);
    expect(await Plan.countDocuments({ slug: 'plus' })).toBe(1);
    await AccessConfiguration.deleteOne({ key: 'global' });
    await ensureAccessCatalog();
    const repeated = await Plan.collection.findOne({ _id: legacy.insertedId });
    expect(repeated.features.length).toBe(migrated.features.length);
  });

  it('registers directly into permanent Free access and protects premium APIs', async () => {
    const auth = await member.get('/api/auth/me').expect(200);
    expect(auth.body.data.access).toMatchObject({ eligible: true, planType: 'FREE', subscription: null });
    await member.get('/api/dashboard/summary').expect(200);
    await member.post('/api/tasks').send({ title: 'Free task' }).expect(201);
    const locked = await member.post('/api/projects').send({ name: 'Private project' }).expect(403);
    expect(locked.body).toMatchObject({ code: 'FEATURE_NOT_INCLUDED', feature: 'projects' });
    const capabilities = await member.get('/api/me/capabilities').expect(200);
    expect(capabilities.body.data.effectivePlan.type).toBe('FREE');
    expect(capabilities.body.data.capabilities.projects.allowed).toBe(false);
    expect(capabilities.body.data.capabilities.tasks.allowed).toBe(true);
    expect(await AccessSubscription.countDocuments({ user: account._id })).toBe(0);
  });

  it('blocks typed transaction edits and excludes locked records from shared list, search, and export APIs', async () => {
    const wallet = await member.post('/api/accounts').send({ name: 'Wallet', type: 'cash' }).expect(201);
    const expense = await member.post('/api/transactions').send({ type: 'expense', amount: 12, accountId: wallet.body.data._id, description: 'Locked cafe purchase' }).expect(201);
    const free = await Plan.findOne({ slug: 'free' });
    await adminAgent.patch('/api/admin/access-control/expenses').send({ accessMode: 'PLAN_BASED', plans: [{ planId: String(free._id), enabled: false }] }).expect(200);
    await member.get('/api/transactions?type=expense').expect(403);
    await member.patch(`/api/transactions/${expense.body.data._id}`).send({ description: 'Changed' }).expect(403);
    await member.delete(`/api/transactions/${expense.body.data._id}`).expect(403);
    expect((await member.get('/api/transactions').expect(200)).body.data).toEqual([]);
    expect((await member.get('/api/search?q=Locked').expect(200)).body.data).toEqual([]);
    expect((await member.get('/api/export/transactions').expect(200)).body.data).toEqual([]);
  });

  it('updates locked text and plan assignments while retaining purchased snapshots until explicit rollout', async () => {
    const project = await Feature.findOne({ key: 'projects' });
    await AccessSubscription.create({ user: account._id, plan: paid._id, activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), entitlementVersion: 1,
      planSnapshot: { name: paid.name, features: [{ key: 'projects', enabled: true, type: 'BOOLEAN' }] } });
    await member.post('/api/projects').send({ name: 'Keep this' }).expect(201);
    const free = await Plan.findOne({ slug: 'free' });
    await adminAgent.patch('/api/admin/access-control/projects').send({ accessMode: 'PLAN_BASED', locked: { title: 'Unlock Projects', description: 'Plan work in one place.', ctaLabel: 'Upgrade to Plus', recommendedPlan: String(paid._id) }, plans: [{ planId: String(free._id), enabled: false }, { planId: String(paid._id), enabled: false }] }).expect(200);
    expect((await member.get('/api/me/capabilities').expect(200)).body.data.capabilities.projects).toMatchObject({ allowed: true, presentation: { title: 'Unlock Projects', description: 'Plan work in one place.', ctaLabel: 'Upgrade to Plus' } });
    await adminAgent.patch('/api/admin/access-control/projects').send({ plans: [{ planId: String(paid._id), enabled: false }], applyExisting: true }).expect(200);
    await member.post('/api/projects').send({ name: 'Blocked' }).expect(403);
    expect((await member.get('/api/me/capabilities').expect(200)).body.data.capabilities.projects.allowed).toBe(false);
    expect((await adminAgent.get('/api/admin/access-control/preview').query({ planId: String(paid._id) }).expect(200)).body.data.capabilities.projects.allowed).toBe(false);
    expect((await AccessSubscription.findOne({ user: account._id })).planSnapshot.features[0].enabled).toBe(true);
    expect(await project.constructor.countDocuments({ key: 'projects' })).toBe(1);
  });

  it('falls back to Free without deleting data or disconnecting Telegram', async () => {
    const subscription = await AccessSubscription.create({ user: account._id, plan: paid._id, activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), entitlementVersion: 1,
      planSnapshot: { name: 'Plus', features: [{ key: 'projects', enabled: true, type: 'BOOLEAN' }] } });
    await member.post('/api/projects').send({ name: 'Existing data' }).expect(201);
    const generated = await member.post('/api/telegram-link').expect(201);
    await consumeTelegramLink(generated.body.data.url.split('start=')[1], { id: 98765, chatId: 98765, username: 'member' });
    await AccessSubscription.updateOne({ _id: subscription._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const capabilities = await member.get('/api/me/capabilities').expect(200);
    expect(capabilities.body.data.effectivePlan.type).toBe('FREE');
    expect(capabilities.body.data.capabilities.projects.allowed).toBe(false);
    await member.get('/api/tasks').expect(200);
    expect((await member.get('/api/telegram-link').expect(200)).body.data.connected).toBe(true);
    expect((await mongoose.connection.collection('projects').countDocuments({ user: account._id }))).toBe(1);
    expect((await AccessSubscription.findById(subscription._id)).planSnapshot.name).toBe('Plus');
  });

  it('serializes concurrent quota writes and gives a quota-specific response', async () => {
    const free = await Plan.findOne({ slug: 'free' });
    await adminAgent.patch('/api/admin/access-control/accounts-limit').send({ plans: [{ planId: String(free._id), enabled: true, limit: 1 }] }).expect(200);
    const responses = await Promise.all([
      member.post('/api/accounts').send({ name: 'Cash', type: 'cash' }),
      member.post('/api/accounts').send({ name: 'Bank', type: 'bank' }),
    ]);
    expect(responses.map((row) => row.status).sort()).toEqual([201, 409]);
    expect(responses.find((row) => row.status === 409).body.code).toBe('FEATURE_LIMIT_EXCEEDED');
    expect(await Account.countDocuments({ user: account._id })).toBe(1);
    expect((await member.get('/api/me/capabilities').expect(200)).body.data.capabilities['accounts-limit']).toMatchObject({ limit: 1, used: 1, remaining: 0 });
  });

  it('lets Free users link Telegram and blocks a paid-only bot action', async () => {
    const free = await Plan.findOne({ slug: 'free' });
    await adminAgent.patch('/api/admin/access-control/expenses').send({ accessMode: 'PLAN_BASED', plans: [{ planId: String(free._id), enabled: false }, { planId: String(paid._id), enabled: true }] }).expect(200);
    const existing = await member.post('/api/accounts').send({ name: 'Cash', type: 'cash' }).expect(201);
    await member.patch('/api/settings').send({ telegram: { defaultExpenseAccount: existing.body.data._id } }).expect(200);
    const link = await member.post('/api/telegram-link').expect(201);
    await consumeTelegramLink(link.body.data.url.split('start=')[1], { id: 1234, chatId: 1234, username: 'free' });
    const send = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) }));
    vi.stubGlobal('fetch', send);
    await handleTelegramUpdate({ message: { from: { id: 1234 }, chat: { id: 1234 }, text: 'spent 500 coffee' } });
    expect(await mongoose.connection.collection('transactions').countDocuments({ user: account._id })).toBe(0);
    expect(send.mock.calls.some(([, options]) => String(options?.body || '').includes('requires a plan upgrade'))).toBe(true);
    await member.post('/api/expenses').send({ accountId: existing.body.data._id, amount: 500, description: 'Coffee' }).expect(403);
  });

  it('keeps suspended accounts restricted even with Free fallback', async () => {
    await User.updateOne({ _id: account._id }, { $set: { status: 'SUSPENDED' } });
    await member.get('/api/tasks').expect(403);
    await member.post('/api/telegram-link').expect(403);
    expect((await member.get('/api/me/capabilities').expect(200)).body.data.capabilities.tasks.reason).toBe('ACCOUNT_SUSPENDED');
  });
});
