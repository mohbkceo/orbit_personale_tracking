import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { Setting } from '../src/models/Setting.js';
import { AuthSession } from '../src/models/AuthSession.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { AnalyticsEvent } from '../src/models/AnalyticsEvent.js';
import { AnalyticsSession } from '../src/models/AnalyticsSession.js';
import { AnalyticsVisitor } from '../src/models/AnalyticsVisitor.js';
import { AdvertisingConsent } from '../src/models/AdvertisingConsent.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Plan } from '../src/models/Plan.js';
import { ActivationLink } from '../src/models/ActivationLink.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { Task } from '../src/models/Task.js';
import { hashPassword } from '../src/services/authService.js';
import { normalizePhone } from '../src/utils/userIdentity.js';
import { createActivationLink } from '../src/services/activationService.js';
import {
  initiateAccountAction,
  completeAccountAction,
} from '../src/services/accountRecoveryService.js';
import {
  assertUserIdentityIndexes,
  inspectUserIdentities,
  migrateUserIdentities,
} from '../src/services/identityMigrationService.js';
import { decryptSecret } from '../src/utils/crypto.js';
import { matchingData } from '../src/analytics/metaProvider.js';

const password = 'a-long-secure-password';
const signup = { fullName: 'Phone Member', phone: '0550123456', password };
const actionHeader = { 'X-Orbit-Admin-Action': '1' };
let mongo;
let passwordHash;
const originalEnv = { ...env };
async function rootAgent(role = 'SUPER_ADMIN') {
  const admin = await Admin.create({
    fullName: 'Support Admin',
    email: `${role.toLowerCase()}@example.com`,
    passwordHash,
    role,
  });
  const agent = request.agent(app);
  await agent.post('/api/admin/auth/login').send({ email: admin.email, password }).expect(200);
  return { admin, agent };
}
async function member() {
  return User.create({ fullName: 'Phone Member', phone: signup.phone, passwordHash });
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
  await Promise.all(
    [
      User,
      Admin,
      Setting,
      AuthSession,
      AccountActionToken,
      AnalyticsEvent,
      AnalyticsVisitor,
      AnalyticsSession,
      AdvertisingConsent,
      AuditLog,
      ActivationLink,
      AccessSubscription,
    ].map((model) => model.init()),
  );
  passwordHash = await hashPassword(password);
});
beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
  Object.assign(env, originalEnv, { CLIENT_URL: 'https://orbit.test' });
});
afterEach(() => {
  Object.assign(env, originalEnv);
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

describe('phone identity validation', () => {
  it.each(['0550123456', '+213550123456', '00213550123456', '0550 12 34 56', '٠٥٥٠١٢٣٤٥٦'])(
    'normalizes %s to the same identity',
    (input) => {
      expect(normalizePhone(input)).toBe('+213550123456');
    },
  );
  it('supports explicit international country codes', () => {
    expect(normalizePhone('+44 20 7946 0018')).toBe('+442079460018');
    expect(normalizePhone('00442079460018')).toBe('+442079460018');
  });
  it.each([
    '123',
    '+213123456789',
    'call +213550123456',
    '+213550123456 ext 5',
    '+213550123456@example.com',
    '',
    null,
    { $ne: null },
    550123456,
  ])('rejects invalid phone %j', (value) => {
    expect(() => normalizePhone(value)).toThrow();
  });
});

describe('registration, login, cookies and onboarding', () => {
  it('registers without email and preserves settings, analytics, onboarding and a real session', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/analytics/session')
      .send({ landingUrl: 'https://orbit.test/?utm_source=test&utm_campaign=phone', entry: true })
      .expect(200);
    const result = await agent
      .post('/api/auth/register')
      .send({ ...signup, language: 'ar' })
      .expect(201);
    const id = result.body.data.user.id;
    expect(result.body.data.user).toMatchObject({
      fullName: signup.fullName,
      phone: '+213550123456',
    });
    expect(result.body.data.user.email).toBeUndefined();
    expect(result.body.data.user.passwordHash).toBeUndefined();
    expect(
      result.headers['set-cookie'].some((cookie) =>
        /orbit_user=.*HttpOnly.*SameSite=Lax/.test(cookie),
      ),
    ).toBe(true);
    const stored = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(stored).not.toHaveProperty('email');
    expect(stored).not.toHaveProperty('phoneVerifiedAt');
    expect((await Setting.findOne({ user: id })).language).toBe('ar');
    expect(await AuthSession.countDocuments({ user: id, revokedAt: null })).toBe(1);
    const event = await AnalyticsEvent.findOne({ eventId: `registration:${id}` });
    expect(event.name).toBe('registration_completed');
    expect(event.attribution.firstTouch.utmCampaign).toBe('phone');
    expect(result.body.data.conversion.eventId).toBe(event.eventId);
    expect((await agent.get('/api/auth/me').expect(200)).body.data.user.phone).toBe(
      '+213550123456',
    );
    expect((await agent.get('/api/me/onboarding').expect(200)).body.data.autoPresent).toBe(true);
    await agent.patch('/api/me/onboarding').send({ status: 'COMPLETED' }).expect(200);
    expect((await agent.get('/api/me/onboarding').expect(200)).body.data.status).toBe('COMPLETED');
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/me').expect(401);
    expect(await AuthSession.countDocuments({ user: id, revokedAt: { $ne: null } })).toBe(1);
  });
  it('supports multiple phone-only users, and rejects equivalent duplicates', async () => {
    await request(app).post('/api/auth/register').send(signup).expect(201);
    await request(app)
      .post('/api/auth/register')
      .send({ ...signup, phone: '0550123457' })
      .expect(201);
    for (const phone of ['+213550123456', '00213550123456']) {
      const failure = await request(app)
        .post('/api/auth/register')
        .send({ ...signup, phone })
        .expect(409);
      expect(failure.body.code).toBe('ACCOUNT_EXISTS');
    }
    expect(await User.countDocuments({ email: { $exists: false } })).toBe(2);
  });
  it('cannot register an equivalent phone twice concurrently', async () => {
    const results = await Promise.all(
      ['0550123456', '+213550123456'].map((phone) =>
        request(app)
          .post('/api/auth/register')
          .send({ ...signup, phone }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments()).toBe(1);
    expect(await Setting.countDocuments()).toBe(1);
    expect(await AnalyticsEvent.countDocuments({ name: 'registration_completed' })).toBe(1);
  });
  it('normalizes phone at the model boundary and enforces its database constraint', async () => {
    const user = await member();
    expect(user.phone).toBe('+213550123456');
    await expect(
      User.create({ fullName: 'Duplicate', phone: '00213550123456', passwordHash }),
    ).rejects.toMatchObject({ code: 11000 });
    user.phone = undefined;
    await expect(user.save()).rejects.toThrow();
    await expect(
      User.create({ fullName: 'Invalid', phone: 'no number', passwordHash }),
    ).rejects.toThrow();
  });
  it('accepts all Algerian formats for phone login', async () => {
    const user = await member();
    for (const identifier of ['0550123456', '+213550123456', '00213550123456']) {
      const result = await request(app)
        .post('/api/auth/login')
        .send({ identifier, password })
        .expect(200);
      expect(result.body.data.user.id).toBe(user.id);
    }
    expect(await AuditLog.countDocuments({ event: 'USER_LOGIN' })).toBe(3);
  });
  it('preserves legacy email-only login and old API request bodies', async () => {
    const user = await User.create({
      fullName: 'Legacy Member',
      email: 'legacy@example.com',
      passwordHash,
    });
    for (const fields of [
      { email: 'LEGACY@example.com' },
      { identifier: ' LEGACY@example.com ' },
    ]) {
      const result = await request(app)
        .post('/api/auth/login')
        .send({ ...fields, password })
        .expect(200);
      expect(result.body.data.user.id).toBe(user.id);
      expect(result.body.data.user.phone).toBeNull();
    }
    expect(await User.countDocuments()).toBe(1);
  });
  it('supports accounts with both identities and keeps email unique', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...signup, email: 'MEMBER@example.com' })
      .expect(201);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'member@example.com', password })
      .expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: signup.phone, phone: '+213550123456', password })
      .expect(200);
    await request(app)
      .post('/api/auth/register')
      .send({ ...signup, phone: '0550123457', email: 'member@example.com' })
      .expect(409);
  });
  it('does not expose unauthenticated or profile-based identity replacement', async () => {
    await request(app).patch('/api/auth/me').send({ phone: '+213550123457' }).expect(401);
    const agent = request.agent(app);
    const result = await agent.post('/api/auth/register').send(signup).expect(201);
    await agent.patch('/api/auth/me').send({ phone: '+213550123457' }).expect(422);
    await agent.patch('/api/auth/me').send({ email: 'replacement@example.com' }).expect(422);
    const stored = await User.findById(result.body.data.user.id);
    expect(stored.phone).toBe('+213550123456');
    expect(stored.email).toBeUndefined();
  });
  it.each([
    { identifier: '+213550123456', email: 'other@example.com' },
    { identifier: '0550123456', phone: '0550123457' },
    { email: 'member@example.com', phone: '0550123456' },
    { identifier: { $ne: null } },
    {},
  ])('rejects conflicting or invalid login fields %j', async (fields) => {
    await request(app)
      .post('/api/auth/login')
      .send({ ...fields, password })
      .expect(typeof fields.identifier === 'object' ? 400 : 422);
  });
  it.each([
    { phone: undefined },
    { phone: 'bad' },
    { phone: 550123456 },
    { fullName: '' },
    { password: 'short' },
  ])('rejects invalid registration %j', async (override) => {
    await request(app)
      .post('/api/auth/register')
      .send({ ...signup, ...override })
      .expect(422);
    expect(await User.countDocuments()).toBe(0);
  });
  it('rejects wrong passwords and preserves suspended-user restrictions', async () => {
    const user = await member();
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: signup.phone, password: 'incorrect' })
      .expect(401);
    await User.updateOne({ _id: user._id }, { $set: { status: 'SUSPENDED' } });
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ identifier: signup.phone, password })
      .expect(200);
    expect(login.body.data.access).toMatchObject({ eligible: false, reason: 'SUSPENDED' });
    await agent.get('/api/tasks').expect(403);
  });
});

describe('activation, administration and recovery', () => {
  it('registers without email, reserves the link, activates once, and preserves duration', async () => {
    const { admin } = await rootAgent();
    const plan = await Plan.create({
      name: 'Month',
      durationValue: 1,
      durationUnit: 'MONTH',
      createdBy: admin._id,
    });
    const link = await createActivationLink(plan._id, admin._id);
    const key = link.url.split('/').pop();
    const agent = request.agent(app);
    await agent
      .post(`/api/activation/${key}/register`)
      .send({ ...signup, phone: 'invalid', gender: 'MALE' })
      .expect(422);
    const result = await agent
      .post(`/api/activation/${key}/register`)
      .send({ ...signup, gender: 'MALE', preferences: { language: 'ar' } })
      .expect(201);
    expect(result.body.data.user.email).toBeUndefined();
    const user = await User.findById(result.body.data.user.id);
    expect(String((await ActivationLink.findOne()).reservedByUser)).toBe(user.id);
    expect(await AccessSubscription.countDocuments()).toBe(0);
    const activated = await agent.post(`/api/activation/${key}/activate`).expect(200);
    expect(new Date(activated.body.data.access.expiresAt).getTime() - Date.now()).toBeGreaterThan(
      27 * 86400000,
    );
    await agent.post(`/api/activation/${key}/activate`).expect(409);
    expect(await AccessSubscription.countDocuments({ user: user._id })).toBe(1);
    expect((await User.findById(user._id)).onboardingCompletedAt).toBeTruthy();
    expect(await AnalyticsEvent.countDocuments({ name: 'registration_completed' })).toBe(1);
    expect((await agent.get('/api/me/onboarding').expect(200)).body.data.autoPresent).toBe(true);
  });
  it('does not reserve a second link or create partial settings on duplicate registration', async () => {
    await member();
    const { admin } = await rootAgent();
    const plan = await Plan.create({
      name: 'Month',
      durationValue: 1,
      durationUnit: 'MONTH',
      createdBy: admin._id,
    });
    const link = await createActivationLink(plan._id, admin._id);
    await request(app)
      .post(`/api/activation/${link.url.split('/').pop()}/register`)
      .send({ ...signup, gender: 'MALE' })
      .expect(409);
    expect((await ActivationLink.findOne()).reservedByUser).toBeFalsy();
    expect(await Setting.countDocuments()).toBe(0);
  });
  it('searches by phone, local phone, name and legacy email, and exposes phone in detail/support data', async () => {
    const user = await member();
    await User.create({ fullName: 'Legacy', email: 'legacy@example.com', passwordHash });
    const { agent } = await rootAgent();
    for (const search of ['+213550123456', '0550123456', 'Phone Member']) {
      const result = await agent.get('/api/admin/users').query({ search }).expect(200);
      expect(result.body.data.map((row) => row._id)).toEqual([user.id]);
      expect(result.body.data[0].phone).toBe('+213550123456');
    }
    expect(
      (await agent.get('/api/admin/users').query({ search: 'legacy@example.com' }).expect(200)).body
        .data,
    ).toHaveLength(1);
    expect((await agent.get(`/api/admin/users/${user.id}`).expect(200)).body.data.user.phone).toBe(
      '+213550123456',
    );
    expect(
      (await agent.get(`/api/admin/users/${user.id}/management`).expect(200)).body.data.user.phone,
    ).toBe('+213550123456');
  });
  it('confirms deletion by phone while preserving CSRF, reauthentication and Super Admin requirements', async () => {
    const user = await member();
    const { agent } = await rootAgent();
    const { agent: staff } = await rootAgent('ADMIN');
    const body = {
      confirmationIdentifier: '+213550123456',
      reason: 'Customer requested deletion',
      adminPassword: password,
    };
    await staff.delete(`/api/admin/users/${user.id}`).set(actionHeader).send(body).expect(403);
    await agent.delete(`/api/admin/users/${user.id}`).send(body).expect(403);
    await agent
      .delete(`/api/admin/users/${user.id}`)
      .set(actionHeader)
      .send({ ...body, adminPassword: 'wrong' })
      .expect(403);
    await agent
      .delete(`/api/admin/users/${user.id}`)
      .set(actionHeader)
      .send({ ...body, confirmationIdentifier: '+213550123457' })
      .expect(422);
    expect(await User.exists({ _id: user._id })).toBeTruthy();
    await agent.delete(`/api/admin/users/${user.id}`).set(actionHeader).send(body).expect(200);
    expect(await AuditLog.countDocuments({ event: 'ADMIN_USER_DELETED' })).toBe(1);
  });
  it('rejects password recovery for phone-only accounts before creating tokens or sending mail', async () => {
    const user = await member();
    const { agent } = await rootAgent();
    Object.assign(env, { RESEND_API_KEY: 'test', EMAIL_FROM: 'test@orbit.test' });
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const result = await agent
      .post(`/api/admin/users/${user.id}/account-action`)
      .set(actionHeader)
      .send({
        kind: 'PASSWORD_RESET',
        reason: 'Customer requested recovery',
        adminPassword: password,
      })
      .expect(409);
    expect(result.body.code).toBe('RECOVERY_EMAIL_REQUIRED');
    expect(await AccountActionToken.countDocuments()).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves legacy one-time email recovery and revokes existing sessions', async () => {
    const user = await User.create({
      fullName: 'Legacy',
      email: 'legacy@example.com',
      passwordHash,
    });
    const { admin } = await rootAgent();
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password }).expect(200);
    Object.assign(env, { RESEND_API_KEY: 'test', EMAIL_FROM: 'test@orbit.test' });
    const fetcher = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    await initiateAccountAction(
      user._id,
      admin._id,
      'PASSWORD_RESET',
      undefined,
      'Customer requested recovery',
    );
    const email = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(email.to).toEqual(['legacy@example.com']);
    const token = email.text.match(/account-action\/([A-Za-z0-9_-]+)/)[1];
    await completeAccountAction(token, 'replacement-long-password');
    await expect(completeAccountAction(token, 'another-long-password')).rejects.toThrow(
      'Link invalid or expired',
    );
    await agent.get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: user.email, password: 'replacement-long-password' })
      .expect(200);
  });
  it('keeps consented registration analytics without fabricated email matching data', async () => {
    const agent = request.agent(app);
    await agent.post('/api/analytics/advertising-consent').send({ granted: true }).expect(200);
    const result = await agent.post('/api/auth/register').send(signup).expect(201);
    const event = await AnalyticsEvent.findOne({
      eventId: `registration:${result.body.data.user.id}`,
    }).select('+metaDelivery');
    const payload = JSON.parse(decryptSecret(event.metaDelivery.payload));
    expect(payload.event_name).toBe('CompleteRegistration');
    expect(payload.user_data.external_id).toHaveLength(1);
    expect(payload.user_data.em).toBeUndefined();
    expect(matchingData({ email: undefined, externalId: 'phone-only' }).em).toBeUndefined();
  });
  it('adds a real email through the existing admin-authorized one-time workflow and keeps phone', async () => {
    const user = await member();
    const { agent: root } = await rootAgent();
    const userAgent = request.agent(app);
    await userAgent
      .post('/api/auth/login')
      .send({ identifier: signup.phone, password })
      .expect(200);
    Object.assign(env, { RESEND_API_KEY: 'test', EMAIL_FROM: 'test@orbit.test' });
    const fetcher = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    const body = {
      kind: 'EMAIL_CHANGE',
      newEmail: 'verified@example.com',
      reason: 'Established customer ownership through support',
      adminPassword: password,
    };
    await root
      .post(`/api/admin/users/${user.id}/account-action`)
      .set(actionHeader)
      .send({ ...body, adminPassword: 'wrong' })
      .expect(403);
    expect(fetcher).not.toHaveBeenCalled();
    await root
      .post(`/api/admin/users/${user.id}/account-action`)
      .set(actionHeader)
      .send(body)
      .expect(200);
    expect((await User.findById(user._id)).email).toBeUndefined();
    const email = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(email.to).toEqual(['verified@example.com']);
    const token = email.text.match(/account-action\/([A-Za-z0-9_-]+)/)[1];
    await request(app).post(`/api/auth/account-action/${token}`).send({}).expect(200);
    const updated = await User.findById(user._id);
    expect(updated.email).toBe('verified@example.com');
    expect(updated.phone).toBe('+213550123456');
    await userAgent.get('/api/auth/me').expect(401);
    await request(app).post(`/api/auth/account-action/${token}`).send({}).expect(410);
    await request(app)
      .post('/api/auth/login')
      .send({ identifier: updated.email, password })
      .expect(200);
    expect(
      await AuditLog.countDocuments({ event: 'USER_EMAIL_VERIFIED', targetId: user._id }),
    ).toBe(1);
  });
});

describe('guarded identity index migration', () => {
  async function legacyCollection() {
    const name = `migration_${new mongoose.Types.ObjectId()}`;
    await mongoose.connection.db.createCollection(name);
    const collection = mongoose.connection.db.collection(name);
    await collection.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
    await collection.createIndex({ fullName: 1 }, { name: 'custom_name_index' });
    return collection;
  }
  it('reports real indexes without writing and preserves IDs, email and related records on migration', async () => {
    const collection = await legacyCollection();
    const id = new mongoose.Types.ObjectId();
    await collection.insertOne({
      _id: id,
      fullName: 'Legacy',
      email: 'legacy@example.com',
      passwordHash,
    });
    const task = await Task.create({ user: id, title: 'Preserved' });
    const before = await collection.findOne({ _id: id });
    const report = await inspectUserIdentities(collection);
    expect(report.legacyEmailIndexes).toEqual(['email_1']);
    await expect(assertUserIdentityIndexes(collection)).rejects.toThrow('migrate:identities');
    expect(await collection.findOne({ _id: id })).toEqual(before);
    await expect(
      migrateUserIdentities(collection, { expectedFingerprint: report.fingerprint }),
    ).rejects.toThrow('Pause');
    await expect(
      migrateUserIdentities(collection, { expectedFingerprint: 'wrong', writesPaused: true }),
    ).rejects.toThrow('Database changed');
    await expect(
      migrateUserIdentities(collection, {
        expectedFingerprint: report.fingerprint,
        writesPaused: true,
      }),
    ).rejects.toThrow('exactly');
    const after = await migrateUserIdentities(collection, {
      expectedFingerprint: report.fingerprint,
      writesPaused: true,
      replaceEmailIndexes: ['email_1'],
    });
    expect(after.indexes.find((index) => index.name === 'custom_name_index')).toBeTruthy();
    expect(after.indexes.find((index) => index.name === 'email_1')).toBeUndefined();
    await expect(assertUserIdentityIndexes(collection)).resolves.toBeUndefined();
    expect(await collection.findOne({ _id: id })).toEqual(before);
    expect((await Task.findById(task._id)).title).toBe('Preserved');
    await collection.insertMany([{ phone: '+213550123456' }, { phone: '+213550123457' }]);
    await expect(collection.insertOne({ phone: '+213550123456' })).rejects.toMatchObject({
      code: 11000,
    });
    await expect(collection.insertOne({ email: 'legacy@example.com' })).rejects.toMatchObject({
      code: 11000,
    });
    const retry = await inspectUserIdentities(collection);
    await migrateUserIdentities(collection, {
      expectedFingerprint: retry.fingerprint,
      writesPaused: true,
    });
  });
  it('detects normalized collisions and refuses to drop the existing index', async () => {
    const collection = await legacyCollection();
    await collection.insertMany([
      { email: 'one@example.com', phone: '0550123456' },
      { email: 'two@example.com', phone: '+213550123456' },
    ]);
    const report = await inspectUserIdentities(collection);
    expect(
      report.problems.some((problem) => problem.reason === 'Normalized identity collision'),
    ).toBe(true);
    await expect(
      migrateUserIdentities(collection, {
        expectedFingerprint: report.fingerprint,
        writesPaused: true,
        replaceEmailIndexes: ['email_1'],
      }),
    ).rejects.toThrow('manual resolution');
    expect((await collection.indexes()).some((index) => index.name === 'email_1')).toBe(true);
    expect((await collection.findOne({ email: 'one@example.com' })).phone).toBe('0550123456');
  });
  it('normalizes existing phones in place and blocks unknown index definitions', async () => {
    const collection = await legacyCollection();
    const { insertedId } = await collection.insertOne({
      email: 'one@example.com',
      phone: '00213550123456',
    });
    let report = await inspectUserIdentities(collection);
    await migrateUserIdentities(collection, {
      expectedFingerprint: report.fingerprint,
      writesPaused: true,
      replaceEmailIndexes: ['email_1'],
    });
    expect((await collection.findOne({ _id: insertedId })).phone).toBe('+213550123456');
    await collection.createIndex({ phone: 1 }, { name: 'unexpected_phone_index' });
    report = await inspectUserIdentities(collection);
    expect(report.problems.some((problem) => problem.index === 'unexpected_phone_index')).toBe(
      true,
    );
  });
  it('retains the old email index if replacement creation fails', async () => {
    const collection = await legacyCollection();
    await collection.insertOne({ email: 'legacy@example.com' });
    const report = await inspectUserIdentities(collection);
    const create = vi
      .spyOn(collection, 'createIndex')
      .mockRejectedValueOnce(new Error('Simulated index build failure'));
    try {
      await expect(
        migrateUserIdentities(collection, {
          expectedFingerprint: report.fingerprint,
          writesPaused: true,
          replaceEmailIndexes: ['email_1'],
        }),
      ).rejects.toThrow('index build failure');
      expect((await collection.indexes()).some((index) => index.name === 'email_1')).toBe(true);
    } finally {
      create.mockRestore();
    }
  });
  it('blocks a compound unique email constraint that could exclude phone-only accounts', async () => {
    const collection = await legacyCollection();
    await collection.createIndex(
      { email: 1, status: 1 },
      { unique: true, name: 'custom_email_status' },
    );
    const report = await inspectUserIdentities(collection);
    expect(report.problems.some((problem) => problem.index === 'custom_email_status')).toBe(true);
    await expect(
      migrateUserIdentities(collection, {
        expectedFingerprint: report.fingerprint,
        writesPaused: true,
        replaceEmailIndexes: ['email_1'],
      }),
    ).rejects.toThrow('manual resolution');
  });
});
