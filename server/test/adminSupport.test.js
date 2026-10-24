import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { AuthSession } from '../src/models/AuthSession.js';
import { SupportSession } from '../src/models/SupportSession.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Plan } from '../src/models/Plan.js';
import { Feature } from '../src/models/Feature.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { env } from '../src/config/env.js';
import { canAccess } from '../src/services/entitlementService.js';
import { Task } from '../src/models/Task.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { TelegramLinkToken } from '../src/models/TelegramLinkToken.js';
import { TelegramSession } from '../src/models/TelegramSession.js';
import { hashPassword } from '../src/services/authService.js';

let mongo;
let owner;
let target;
let other;
let paidPlan;
let superAgent;
let ordinaryAdmin;
let userAgent;
const header = { 'X-Orbit-Admin-Action': '1' };
const password = 'very-long-root-password';

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.init(),
    Admin.init(),
    AuthSession.init(),
    SupportSession.init(),
    AccessSubscription.init(),
    Plan.init(),
  ]);
  owner = await Admin.create({
    fullName: 'Root',
    email: 'root@example.com',
    passwordHash: await hashPassword(password),
    role: 'SUPER_ADMIN',
  });
  await Admin.create({
    fullName: 'Staff',
    email: 'staff@example.com',
    passwordHash: await hashPassword(password),
    role: 'ADMIN',
  });
  target = await User.create({
    fullName: 'Target User',
    email: 'target@example.com',
    passwordHash: await hashPassword('very-long-user-password'),
  });
  other = await User.create({
    fullName: 'Other User',
    email: 'other@example.com',
    passwordHash: await hashPassword('very-long-user-password'),
  });
  paidPlan = await Plan.create({
    name: 'Paid',
    slug: 'paid-support-test',
    kind: 'PAID',
    durationValue: 30,
    durationUnit: 'DAY',
    status: 'ACTIVE',
    createdBy: owner._id,
  });
  await Task.create({ user: target._id, title: 'Target task', status: 'todo' });
  await Task.create({ user: other._id, title: 'Other task', status: 'todo' });
  superAgent = request.agent(app);
  ordinaryAdmin = request.agent(app);
  userAgent = request.agent(app);
  await superAgent
    .post('/api/admin/auth/login')
    .send({ email: 'root@example.com', password })
    .expect(200);
  await ordinaryAdmin
    .post('/api/admin/auth/login')
    .send({ email: 'staff@example.com', password })
    .expect(200);
  await userAgent
    .post('/api/auth/login')
    .send({ email: 'target@example.com', password: 'very-long-user-password' })
    .expect(200);
});

const enter = (agent = superAgent, userId = target.id) =>
  agent
    .post('/api/admin/support/sessions')
    .set(header)
    .send({
      userId,
      reason: 'Investigating a reported workspace issue',
      adminPassword: password,
      confirmed: true,
    });

describe('admin support boundary', () => {
  it('allows only a Super Admin and requires explicit confirmation and fresh verification', async () => {
    await enter(ordinaryAdmin).expect(403);
    await userAgent.get('/api/admin/support/session').expect(401);
    await superAgent
      .post('/api/admin/support/sessions')
      .send({
        userId: target.id,
        reason: 'Investigating a reported workspace issue',
        adminPassword: password,
        confirmed: true,
      })
      .expect(403);
    await superAgent
      .post('/api/admin/support/sessions')
      .set(header)
      .send({
        userId: target.id,
        reason: 'Investigating a reported workspace issue',
        adminPassword: 'wrong',
        confirmed: true,
      })
      .expect(403);
    await enter().expect(201);
  });

  it('reads only the selected tenant and blocks all ordinary API calls and support mutations', async () => {
    await enter().expect(201);
    const result = await superAgent.get('/api/admin/support/workspace/tasks').expect(200);
    expect(result.body.data.data.map((row) => row.title)).toEqual(['Target task']);
    const forged = await superAgent
      .get(`/api/admin/support/workspace/tasks?userId=${other.id}`)
      .expect(200);
    expect(forged.body.data.data.map((row) => row.title)).toEqual(['Target task']);
    await superAgent.get('/api/admin/support/workspace/unknown').expect(404);
    await superAgent
      .post('/api/admin/support/workspace/tasks')
      .set(header)
      .send({ title: 'Injected' })
      .expect(403);
    await superAgent.post('/api/tasks').send({ title: 'Injected' }).expect(403);
    await superAgent.get('/api/tasks').expect(403);
    await superAgent
      .patch(`/api/admin/users/${target.id}/status`)
      .set(header)
      .send({ status: 'SUSPENDED', reason: 'This must be blocked', adminPassword: password })
      .expect(403);
    expect(await Task.countDocuments({ title: 'Injected' })).toBe(0);
    expect((await User.findById(target._id)).status).toBe('ACTIVE');
    const audits = await AuditLog.find({ event: 'SUPPORT_OPERATION_DENIED' });
    expect(audits.length).toBeGreaterThan(0);
    expect(JSON.stringify(await AuditLog.find({ event: 'SUPPORT_RESOURCE_READ' }).lean())).not.toContain('Target task');
  });

  it('refreshes and direct URLs require the live session; exit and expiry revoke immediately', async () => {
    await superAgent.get('/api/admin/support/workspace/tasks').expect(401);
    await enter().expect(201);
    await superAgent.get('/api/admin/support/session').expect(200);
    await superAgent.post('/api/admin/support/exit').set(header).expect(200);
    await superAgent.get('/api/admin/support/workspace/tasks').expect(401);
    await enter().expect(201);
    await SupportSession.updateMany(
      { admin: owner._id, revokedAt: null },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    await superAgent.get('/api/admin/support/session').expect(401);
    expect(await AuditLog.countDocuments({ event: 'SUPPORT_SESSION_EXPIRED' })).toBe(1);
  });

  it('revokes signed user sessions and preserves separate auth and subscription versions', async () => {
    const before = await User.findById(target._id);
    const sessions = (await superAgent.get(`/api/admin/users/${target.id}/management`).expect(200))
      .body.data.sessions;
    expect(sessions).toHaveLength(1);
    await superAgent
      .post(`/api/admin/users/${target.id}/sessions/revoke`)
      .set(header)
      .send({
        sessionId: sessions[0]._id,
        reason: 'User reported a stolen device',
        adminPassword: password,
      })
      .expect(200);
    await userAgent.get('/api/auth/me').expect(401);
    expect((await User.findById(target._id)).accessVersion).toBe(before.accessVersion);
  });

  it('restarts the optional onboarding tour without clearing paid activation history', async () => {
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    await User.updateOne(
      { _id: target._id },
      {
        $set: {
          onboardingCompletedAt: completedAt,
          planSelectionSkippedAt: completedAt,
          firstUseOnboarding: { status: 'COMPLETED', step: 'finish', completedAt },
        },
      },
    );
    await superAgent
      .post(`/api/admin/users/${target.id}/onboarding/reset`)
      .set(header)
      .send({ reason: 'User requested another guided tour', adminPassword: password })
      .expect(200);
    const state = (await userAgent.get('/api/me/onboarding').expect(200)).body.data;
    expect(state).toMatchObject({ status: 'NOT_STARTED', step: 'welcome', autoPresent: true });
    const updated = await User.findById(target._id);
    expect(updated.onboardingCompletedAt).toEqual(completedAt);
    expect(updated.planSelectionSkippedAt).toBeUndefined();
  });

  it('disconnects Telegram and removes pending reconnect tokens and bot flow state', async () => {
    await TelegramConnection.create({
      user: target._id,
      telegramUserId: '12345',
      chatId: '12345',
      linkedAt: new Date(),
    });
    await TelegramLinkToken.create({
      user: target._id,
      tokenHash: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 600000),
    });
    await TelegramSession.create({
      telegramUserId: '12345',
      chatId: '12345',
      action: 'ADD_TASK',
      expiresAt: new Date(Date.now() + 600000),
    });
    await superAgent
      .post(`/api/admin/users/${target.id}/telegram/disconnect`)
      .set(header)
      .send({ reason: 'User requested a fresh Telegram connection', adminPassword: password })
      .expect(200);
    expect(await TelegramConnection.countDocuments({ user: target._id })).toBe(0);
    expect(await TelegramLinkToken.countDocuments({ user: target._id, consumedAt: null })).toBe(0);
    expect(await TelegramSession.countDocuments({ telegramUserId: '12345' })).toBe(0);
  });

  it('makes manual grants idempotent, stacks paid time, and audits without credentials', async () => {
    const body = {
      mode: 'ASSIGN',
      planId: paidPlan.id,
      grantKind: 'COMPLIMENTARY',
      reason: 'Courtesy access after support issue',
      idempotencyKey: crypto.randomUUID(),
      adminPassword: password,
    };
    await ordinaryAdmin.post(`/api/admin/users/${target.id}/grants`).set(header).send(body).expect(403);
    const first = await superAgent
      .post(`/api/admin/users/${target.id}/grants`)
      .set(header)
      .send(body)
      .expect(201);
    const second = await superAgent
      .post(`/api/admin/users/${target.id}/grants`)
      .set(header)
      .send(body)
      .expect(201);
    expect(first.body.data.id).toBe(second.body.data.id);
    await superAgent
      .post(`/api/admin/users/${target.id}/grants`)
      .set(header)
      .send({ ...body, reason: 'A different support reason for this grant' })
      .expect(409);
    expect(await AccessSubscription.countDocuments({ user: target._id })).toBe(1);
    const extension = await superAgent
      .post(`/api/admin/users/${target.id}/grants`)
      .set(header)
      .send({
        ...body,
        mode: 'EXTEND',
        planId: undefined,
        durationDays: 10,
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(201);
    const grants = await AccessSubscription.find({ user: target._id }).sort({ expiresAt: 1 });
    expect(grants).toHaveLength(2);
    expect(new Date(extension.body.data.expiresAt).getTime() - grants[0].expiresAt.getTime()).toBe(
      10 * 86400000,
    );
    expect(
      JSON.stringify(await AuditLog.find({ targetType: 'AccessSubscription' }).lean()),
    ).not.toContain(password);
    await superAgent
      .post(`/api/admin/users/${target.id}/grants/${grants[1].id}/revoke`)
      .set(header)
      .send({ reason: 'Grant was issued in error', adminPassword: password })
      .expect(200);
    expect((await AccessSubscription.findById(grants[0]._id)).status).toBe('ACTIVE');
  });

  it('suspends and unsuspends across web access with reason and audit', async () => {
    await superAgent
      .patch(`/api/admin/users/${target.id}/status`)
      .set(header)
      .send({
        status: 'SUSPENDED',
        reason: 'User requested temporary access pause',
        adminPassword: password,
      })
      .expect(200);
    await userAgent.get('/api/tasks').expect(401);
    await userAgent
      .post('/api/auth/login')
      .send({ email: 'target@example.com', password: 'very-long-user-password' })
      .expect(200);
    await userAgent.get('/api/tasks').expect(403);
    expect((await canAccess(target._id, 'tasks')).reason).toBe('ACCOUNT_SUSPENDED');
    await superAgent
      .patch(`/api/admin/users/${target.id}/status`)
      .set(header)
      .send({
        status: 'ACTIVE',
        reason: 'User verified and asked to resume',
        adminPassword: password,
      })
      .expect(200);
    expect(
      await AuditLog.countDocuments({ event: { $in: ['USER_SUSPENDED', 'USER_UNSUSPENDED'] } }),
    ).toBe(2);
  });

  it('applies individual feature overrides to the shared web and Telegram entitlement decision', async () => {
    await Feature.create({
      key: 'tasks',
      name: 'Tasks',
      category: 'Planning',
      icon: 'mdi:check',
      type: 'BOOLEAN',
      accessMode: 'FREE',
    });
    await superAgent
      .put(`/api/admin/users/${target.id}/overrides/tasks`)
      .set(header)
      .send({
        enabled: false,
        reason: 'Temporary feature restriction for support',
        adminPassword: password,
      })
      .expect(200);
    await userAgent.get('/api/tasks').expect(403);
    expect((await canAccess(target._id, 'tasks')).allowed).toBe(false);
    await superAgent
      .delete(`/api/admin/users/${target.id}/overrides/tasks`)
      .set(header)
      .send({ reason: 'Restriction no longer required', adminPassword: password })
      .expect(200);
    expect((await canAccess(target._id, 'tasks')).allowed).toBe(true);
  });

  it('sends one-time recovery to the user and invalidates old credentials without exposing the token to admins', async () => {
    env.RESEND_API_KEY = 'test-delivery-key';
    env.EMAIL_FROM = 'Orbit <support@example.com>';
    let mail;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, request) => {
        mail = JSON.parse(request.body);
        return { ok: true };
      }),
    );
    try {
      const sent = await superAgent
        .post(`/api/admin/users/${target.id}/account-action`)
        .set(header)
        .send({
          kind: 'PASSWORD_RESET',
          reason: 'User requested password recovery',
          adminPassword: password,
        })
        .expect(200);
      expect(JSON.stringify(sent.body)).not.toContain('/account-action/');
      expect(mail.to).toEqual(['target@example.com']);
      const token = mail.text.match(/\/account-action\/([A-Za-z0-9_-]+)/)?.[1];
      expect(token).toBeTruthy();
      expect(await AccountActionToken.countDocuments({ user: target._id })).toBe(1);
      await request(app)
        .post(`/api/auth/account-action/${token}`)
        .send({ password: 'different-strong-password' })
        .expect(200);
      await request(app)
        .post(`/api/auth/account-action/${token}`)
        .send({ password: 'different-strong-password' })
        .expect(410);
      await userAgent.get('/api/auth/me').expect(401);
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'target@example.com', password: 'very-long-user-password' })
        .expect(401);
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'target@example.com', password: 'different-strong-password' })
        .expect(200);
      expect(JSON.stringify(await AuditLog.find({ targetId: target._id }).lean())).not.toContain(
        'different-strong-password',
      );
    } finally {
      env.RESEND_API_KEY = '';
      env.EMAIL_FROM = '';
      vi.unstubAllGlobals();
    }
  });
});
