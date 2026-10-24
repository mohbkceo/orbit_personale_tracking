import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { hashPassword } from '../src/services/authService.js';
import { Admin } from '../src/models/Admin.js';
import { User } from '../src/models/User.js';
import { Task } from '../src/models/Task.js';
import { Account } from '../src/models/Account.js';
import { PaymentOrder } from '../src/models/PaymentOrder.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { Plan } from '../src/models/Plan.js';
import { ActivationLink } from '../src/models/ActivationLink.js';
import { AuthSession } from '../src/models/AuthSession.js';
import { SupportSession } from '../src/models/SupportSession.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { workspaceModels } from '../src/services/adminUserLifecycleService.js';

let mongo;
let root;
let target;
let other;
let plan;
let rootAgent;
let staffAgent;
let targetAgent;
const password = 'very-long-root-password';
const header = { 'X-Orbit-Admin-Action': '1' };
const reason = 'User requested permanent account removal';

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
  await Promise.all([Admin.init(), User.init(), PaymentOrder.init(), ActivationLink.init()]);
  root = await Admin.create({ fullName: 'Root', email: 'root@example.com', passwordHash: await hashPassword(password), role: 'SUPER_ADMIN' });
  await Admin.create({ fullName: 'Staff', email: 'staff@example.com', passwordHash: await hashPassword(password), role: 'ADMIN' });
  target = await User.create({ fullName: 'Target User', email: 'target@example.com', passwordHash: await hashPassword('long-user-password') });
  other = await User.create({ fullName: 'Other User', email: 'other@example.com', passwordHash: await hashPassword('long-user-password') });
  plan = await Plan.create({ name: 'Paid', slug: 'paid-lifecycle-test', kind: 'PAID', durationValue: 30, durationUnit: 'DAY', status: 'ACTIVE', createdBy: root._id });
  await Task.create({ user: target._id, title: 'Private task', status: 'todo' });
  await Task.create({ user: other._id, title: 'Other task', status: 'todo' });
  await Account.create({ user: target._id, name: 'Private account', type: 'cash', currency: 'DZD', openingBalance: 100 });
  rootAgent = request.agent(app);
  staffAgent = request.agent(app);
  targetAgent = request.agent(app);
  await rootAgent.post('/api/admin/auth/login').send({ email: 'root@example.com', password }).expect(200);
  await staffAgent.post('/api/admin/auth/login').send({ email: 'staff@example.com', password }).expect(200);
  await targetAgent.post('/api/auth/login').send({ email: 'target@example.com', password: 'long-user-password' }).expect(200);
});

const deleteBody = (email = 'target@example.com') => ({ reason, adminPassword: password, confirmationEmail: email });

describe('admin user lifecycle', () => {
  it('covers every registered user-owned collection in the deletion policy', () => {
    const retained = new Set(['PaymentOrder', 'AccessSubscription', 'SupportSession']);
    const handled = new Set(workspaceModels.map((Model) => Model.modelName));
    const missing = mongoose.modelNames().filter(
      (name) => mongoose.model(name).schema.path('user') && !retained.has(name) && !handled.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('requires Super Admin, CSRF, fresh password and matching email to delete', async () => {
    await staffAgent.delete(`/api/admin/users/${target.id}`).set(header).send(deleteBody()).expect(403);
    await targetAgent.delete(`/api/admin/users/${target.id}`).set(header).send(deleteBody()).expect(401);
    await rootAgent.delete(`/api/admin/users/${target.id}`).send(deleteBody()).expect(403);
    await rootAgent.delete(`/api/admin/users/${target.id}`).set(header).send({ ...deleteBody(), adminPassword: 'wrong' }).expect(403);
    await rootAgent.delete(`/api/admin/users/${target.id}`).set(header).send(deleteBody('other@example.com')).expect(422);
    expect(await User.exists({ _id: target._id })).toBeTruthy();
  });

  it('erases the account and workspace, revokes access and retains immutable ledgers', async () => {
    await PaymentOrder.create({ user: target._id, plan: plan._id, key: 'paid-order', state: 'PAID', amountMinor: 100000, currency: 'DZD', environment: 'sandbox', paidAt: new Date(), analytics: { visitorId: 'visitor-1' } });
    await AccessSubscription.create({ user: target._id, plan: plan._id, source: 'ADMIN_GRANT', grantKind: 'COMPLIMENTARY', startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Paid' } });
    const activeLink = await ActivationLink.create({ tokenHash: crypto.randomBytes(32).toString('hex'), plan: plan._id, createdByAdmin: root._id, intendedUser: target._id, status: 'ACTIVE' });
    await SupportSession.create({ admin: root._id, user: target._id, reason, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 600000) });
    await TelegramConnection.create({ user: target._id, telegramUserId: '12345', chatId: '12345', linkedAt: new Date() });
    await rootAgent.delete(`/api/admin/users/${target.id}`).set(header).send(deleteBody()).expect(200);
    expect(await User.exists({ _id: target._id })).toBeNull();
    expect(await Task.countDocuments({ user: target._id })).toBe(0);
    expect(await Account.countDocuments({ user: target._id })).toBe(0);
    expect(await TelegramConnection.countDocuments({ user: target._id })).toBe(0);
    expect(await AuthSession.countDocuments({ user: target._id })).toBe(0);
    expect((await SupportSession.findOne({ user: target._id })).revokedReason).toBe('USER_DELETED');
    expect((await ActivationLink.findById(activeLink._id)).status).toBe('REVOKED');
    const retainedOrder = await PaymentOrder.findOne({ user: target._id }).select('+analytics');
    expect(retainedOrder.state).toBe('PAID');
    expect(retainedOrder.analytics).toBeUndefined();
    expect(await AccessSubscription.countDocuments({ user: target._id })).toBe(1);
    expect((await AccessSubscription.findOne({ user: target._id })).status).toBe('REVOKED');
    expect(await AuditLog.countDocuments({ event: 'ADMIN_USER_DELETED', targetId: target._id })).toBe(1);
    expect(await Task.countDocuments({ user: other._id })).toBe(1);
    expect((await rootAgent.get('/api/admin/dashboard').expect(200)).body.data.metrics.activeAccess).toBe(0);
    await targetAgent.get('/api/auth/me').expect(401);
    await rootAgent.get(`/api/admin/users/${target.id}`).expect(404);
  });

  it('blocks deletion while a payment remains unfinished without partial erasure', async () => {
    await PaymentOrder.create({ user: target._id, plan: plan._id, key: 'open-order', state: 'PENDING', amountMinor: 100000, currency: 'DZD', environment: 'sandbox' });
    await rootAgent.delete(`/api/admin/users/${target.id}`).set(header).send(deleteBody()).expect(409);
    expect(await User.exists({ _id: target._id })).toBeTruthy();
    expect(await Task.countDocuments({ user: target._id })).toBe(1);
  });

  it('applies bulk status and session actions only to selected users', async () => {
    const ids = [target.id, other.id];
    const body = { ids, action: 'SUSPEND', reason: 'Security review of selected accounts', adminPassword: password };
    await staffAgent.post('/api/admin/users/bulk').set(header).send(body).expect(403);
    await rootAgent.post('/api/admin/users/bulk').set(header).send({ ...body, ids: [target.id, target.id] }).expect(422);
    await rootAgent.post('/api/admin/users/bulk').set(header).send(body).expect(200);
    expect((await User.findById(target._id)).status).toBe('SUSPENDED');
    expect((await User.findById(other._id)).status).toBe('SUSPENDED');
    await targetAgent.get('/api/tasks').expect(401);
    await rootAgent.post('/api/admin/users/bulk').set(header).send({ ...body, action: 'UNSUSPEND', ids: [target.id] }).expect(200);
    expect((await User.findById(target._id)).status).toBe('ACTIVE');
    expect((await User.findById(other._id)).status).toBe('SUSPENDED');
    await rootAgent.post('/api/admin/users/bulk').set(header).send({ ...body, action: 'REVOKE_SESSIONS', ids: [target.id] }).expect(200);
    expect(await AuditLog.countDocuments({ targetId: target._id, event: 'ADMIN_USER_SESSIONS_REVOKED' })).toBe(1);
  });

  it('requires typed bulk deletion confirmation and reports blocked users individually', async () => {
    await PaymentOrder.create({ user: other._id, plan: plan._id, key: 'open-order', state: 'PENDING', amountMinor: 100000, currency: 'DZD', environment: 'sandbox' });
    const body = { ids: [target.id, other.id], action: 'DELETE', reason, adminPassword: password };
    await rootAgent.post('/api/admin/users/bulk').set(header).send(body).expect(422);
    const response = await rootAgent.post('/api/admin/users/bulk').set(header).send({ ...body, confirmation: 'DELETE 2' }).expect(200);
    expect(response.body.data.results).toEqual([
      { id: target.id, deleted: true },
      { id: other.id, deleted: false, error: 'Resolve the unfinished payment before deleting this user' },
    ]);
    expect(await User.exists({ _id: target._id })).toBeNull();
    expect(await User.exists({ _id: other._id })).toBeTruthy();
    expect(await AuditLog.countDocuments({ event: 'ADMIN_USER_DELETE_BLOCKED', targetId: other._id })).toBe(1);
  });
});
