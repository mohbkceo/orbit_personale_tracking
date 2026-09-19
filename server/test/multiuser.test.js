import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { Plan } from '../src/models/Plan.js';
import { ActivationLink } from '../src/models/ActivationLink.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { TelegramConnection } from '../src/models/TelegramConnection.js';
import { TelegramLinkToken } from '../src/models/TelegramLinkToken.js';
import { Account } from '../src/models/Account.js';
import { Transaction } from '../src/models/Transaction.js';
import { Task } from '../src/models/Task.js';
import { Setting } from '../src/models/Setting.js';
import { Contact } from '../src/models/Personal.js';
import { hashPassword } from '../src/services/authService.js';
import { addDuration } from '../src/services/accessService.js';
import { handleTelegramUpdate } from '../src/telegram/handler.js';
import { migrateLegacy } from '../src/scripts/migrateLegacy.js';

let mongo;
let superAgent;
let plan;

async function makeLink(agent = superAgent, planId = plan._id) {
  const response = await agent.post('/api/admin/activation-links').send({ planId: String(planId), validityDays: 7 }).expect(201);
  expect(response.body.data.link.tokenHash).toBeUndefined();
  expect(response.body.data.link.encryptedToken).toBeUndefined();
  return { id: response.body.data.link._id, key: response.body.data.url.split('/').pop() };
}

async function onboard(email, name = 'Test User') {
  const link = await makeLink();
  const agent = request.agent(app);
  await agent.post(`/api/activation/${link.key}/register`).send({ fullName: name, email, password: 'very-long-user-password', preferences: { defaultCurrency: 'DZD' } }).expect(201);
  await agent.post(`/api/activation/${link.key}/activate`).expect(200);
  return { agent, link, user: await User.findOne({ email }) };
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
  await Promise.all([User.init(), Admin.init(), Plan.init(), ActivationLink.init(), AccessSubscription.init(), TelegramConnection.init(), TelegramLinkToken.init(), Setting.init()]);
});
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); vi.unstubAllGlobals(); });
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Admin.init(), Plan.init(), ActivationLink.init(), AccessSubscription.init(), TelegramConnection.init(), TelegramLinkToken.init(), Setting.init()]);
  await Admin.create({ fullName: 'Root Admin', email: 'root@example.com', passwordHash: await hashPassword('very-long-root-password'), role: 'SUPER_ADMIN' });
  superAgent = request.agent(app);
  await superAgent.post('/api/admin/auth/login').send({ email: 'root@example.com', password: 'very-long-root-password' }).expect(200);
  plan = (await superAgent.post('/api/admin/plans').send({ name: '3 Months', durationValue: 3, durationUnit: 'MONTH' }).expect(201)).body.data;
});

describe('multi-user access', () => {
  it('uses calendar-aware duration arithmetic', () => {
    expect(addDuration(new Date('2025-01-31T10:00:00.000Z'), 1, 'MONTH').toISOString()).toBe('2025-02-28T10:00:00.000Z');
    expect(addDuration(new Date('2024-02-29T10:00:00.000Z'), 1, 'YEAR').toISOString()).toBe('2025-02-28T10:00:00.000Z');
  });

  it('requires authentication and rejects invalid login', async () => {
    await request(app).get('/api/tasks').expect(401);
    await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong' }).expect(401);
    const { agent } = await onboard('a@example.com');
    await agent.get('/api/tasks').expect(200);
    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/tasks').expect(401);
  });

  it('validates links, separates registration from activation, and blocks double activation', async () => {
    const link = await makeLink();
    const agent = request.agent(app);
    await request(app).get(`/api/activation/${link.key}`).expect(200);
    await agent.post(`/api/activation/${link.key}/register`).send({ fullName: 'Alice', email: 'alice@example.com', password: 'very-long-user-password' }).expect(201);
    await agent.get('/api/tasks').expect(403);
    await agent.post('/api/telegram-link').expect(201);
    const responses = await Promise.all([agent.post(`/api/activation/${link.key}/activate`), agent.post(`/api/activation/${link.key}/activate`)]);
    expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
    expect(await AccessSubscription.countDocuments()).toBe(1);
    expect((await AccessSubscription.findOne()).expiresAt.getTime() - Date.now()).toBeGreaterThan(80 * 86400000);
    await request(app).get(`/api/activation/${link.key}`).expect(409);
  });

  it('rejects invalid, expired, and revoked links but retains valid links after plan deactivation', async () => {
    await request(app).get('/api/activation/invalid').expect(404);
    const expired = await makeLink();
    await ActivationLink.updateOne({ _id: expired.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).get(`/api/activation/${expired.key}`).expect(410);
    const revoked = await makeLink();
    await superAgent.post(`/api/admin/activation-links/${revoked.id}/revoke`).expect(200);
    await request(app).get(`/api/activation/${revoked.key}`).expect(410);
    const valid = await makeLink();
    await superAgent.patch(`/api/admin/plans/${plan._id}`).send({ status: 'INACTIVE' }).expect(200);
    await request(app).get(`/api/activation/${valid.key}`).expect(200);
    await superAgent.post('/api/admin/activation-links').send({ planId: String(plan._id) }).expect(409);
  });

  it('isolates tasks, money, debts, dashboard, search, and exports', async () => {
    const a = await onboard('a@example.com', 'Alice');
    const b = await onboard('b@example.com', 'Bob');
    expect(String(a.user._id)).not.toBe(String(b.user._id));
    expect((await b.agent.get('/api/auth/me').expect(200)).body.data.user.email).toBe('b@example.com');
    const account = (await a.agent.post('/api/accounts').send({ name: 'Cash', type: 'cash' }).expect(201)).body.data;
    const task = (await a.agent.post('/api/tasks').send({ title: 'Private task' }).expect(201)).body.data;
    expect(String(task.user)).toBe(String(a.user._id));
    expect(await Task.countDocuments({ user: b.user._id })).toBe(0);
    const transaction = (await a.agent.post('/api/expenses').send({ accountId: account._id, amount: 500, description: 'Coffee', category: 'Food' }).expect(201)).body.data;
    const debt = (await a.agent.post('/api/debts').send({ personName: 'Friend', type: 'receivable', originalAmount: 1000 }).expect(201)).body.data;
    const contact = (await a.agent.post('/api/contacts').send({ name: 'Private contact' }).expect(201)).body.data;
    await a.agent.post('/api/notes').send({ title: 'Private note' }).expect(201);
    expect((await b.agent.get('/api/tasks').expect(200)).body.data).toHaveLength(0);
    expect((await b.agent.get('/api/transactions').expect(200)).body.data).toHaveLength(0);
    expect((await b.agent.get('/api/debts').expect(200)).body.data).toHaveLength(0);
    await b.agent.patch(`/api/tasks/${task._id}`).send({ title: 'Stolen' }).expect(404);
    await b.agent.delete(`/api/tasks/${task._id}`).expect(404);
    await b.agent.patch(`/api/transactions/${transaction._id}`).send({ description: 'Stolen' }).expect(404);
    await b.agent.delete(`/api/debts/${debt._id}`).expect(404);
    expect((await b.agent.get('/api/dashboard/summary').expect(200)).body.data.money.expenses).toBe(0);
    expect((await b.agent.get('/api/search?q=Private').expect(200)).body.data).toHaveLength(0);
    const backup = (await b.agent.get('/api/export/all').expect(200)).body.data;
    expect(backup.tasks).toHaveLength(0);
    expect(backup.transactions).toHaveLength(0);
    expect(backup.debts).toHaveLength(0);
    expect(backup.notes).toHaveLength(0);
    await b.agent.post('/api/expenses').send({ accountId: account._id, amount: 10, description: 'Bad', category: 'Other' }).expect(404);
    await b.agent.post('/api/debts').send({ personName: 'Bad', personId: contact._id, type: 'receivable', originalAmount: 10 }).expect(404);
    expect(await Contact.countDocuments({ user: b.user._id })).toBe(0);
    const users = (await superAgent.get('/api/admin/users').expect(200)).body.data;
    expect(users.find((row) => row.email === 'b@example.com').accessStatus).toBe('ACTIVE');
    expect((await superAgent.get('/api/admin/dashboard').expect(200)).body.data.metrics.activeAccess).toBe(2);
  });

  it('blocks expired and suspended users, renews without losing remaining time or data', async () => {
    const { agent, user } = await onboard('renew@example.com');
    await agent.post('/api/tasks').send({ title: 'Keep me' }).expect(201);
    const old = await AccessSubscription.findOne({ user: user._id });
    const expected = addDuration(old.expiresAt, 3, 'MONTH');
    const renewal = await makeLink();
    await agent.post(`/api/activation/${renewal.key}/activate`).expect(200);
    const latest = await AccessSubscription.findOne({ user: user._id }).sort({ expiresAt: -1 });
    expect(latest.expiresAt.getTime()).toBe(expected.getTime());
    expect((await agent.get('/api/tasks').expect(200)).body.data).toHaveLength(1);
    await AccessSubscription.updateMany({ user: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get('/api/tasks').expect(403);
    expect((await agent.get('/api/auth/me').expect(200)).body.data.access.reason).toBe('EXPIRED');
    await superAgent.patch(`/api/admin/users/${user._id}/status`).send({ status: 'SUSPENDED' }).expect(200);
    expect((await agent.get('/api/auth/me').expect(200)).body.data.access.reason).toBe('SUSPENDED');
    expect((await agent.post('/api/auth/login').send({ email: 'renew@example.com', password: 'very-long-user-password' }).expect(200)).body.data.access.reason).toBe('SUSPENDED');
    await agent.get('/api/tasks').expect(403);
    await superAgent.patch(`/api/admin/users/${user._id}/status`).send({ status: 'ACTIVE' }).expect(200);
    const newLink = await makeLink();
    await agent.post(`/api/activation/${newLink.key}/activate`).expect(200);
    expect((await agent.get('/api/tasks').expect(200)).body.data).toHaveLength(1);
  });

  it('binds user-detail renewal links to the intended account', async () => {
    const a = await onboard('bound-a@example.com');
    const b = await onboard('bound-b@example.com');
    const response = await superAgent.post(`/api/admin/users/${a.user._id}/renewal-link`).send({ planId: String(plan._id) }).expect(201);
    const key = response.body.data.url.split('/').pop();
    expect(response.body.data.link.intendedUser).toBe(String(a.user._id));
    expect((await request(app).get(`/api/activation/${key}`).expect(200)).body.data.requiresExistingAccount).toBe(true);
    await b.agent.post(`/api/activation/${key}/activate`).expect(403);
    await request(app).post(`/api/activation/${key}/register`).send({ fullName: 'Wrong User', email: 'wrong@example.com', password: 'very-long-user-password' }).expect(403);
    await a.agent.post(`/api/activation/${key}/activate`).expect(200);
    expect(await AccessSubscription.countDocuments({ user: b.user._id })).toBe(1);
  });

  it('enforces separate admin roles and prevents ordinary admins from managing admins', async () => {
    const created = await superAgent.post('/api/admin/admins').send({ fullName: 'Staff', email: 'staff@example.com', password: 'very-long-staff-password', role: 'ADMIN' }).expect(201);
    const staff = request.agent(app);
    await staff.post('/api/admin/auth/login').send({ email: 'staff@example.com', password: 'very-long-staff-password' }).expect(200);
    await staff.get('/api/admin/users').expect(200);
    await staff.post('/api/admin/activation-links').send({ planId: String(plan._id) }).expect(201);
    await staff.get('/api/admin/admins').expect(403);
    await staff.patch(`/api/admin/admins/${created.body.data.id}`).send({ role: 'SUPER_ADMIN' }).expect(403);
    await staff.get('/api/tasks').expect(401);
  });

  it('links Telegram once, scopes commands, blocks expired access, and resumes after renewal', async () => {
    const a = await onboard('telegram@example.com');
    const b = await onboard('other@example.com');
    const fetchMock = vi.fn(async (_url, requestOptions) => ({ ok: true, json: async () => ({ ok: true, result: { message_id: 1, body: JSON.parse(requestOptions.body) } }) }));
    vi.stubGlobal('fetch', fetchMock);
    const linkResponse = await a.agent.post('/api/telegram-link').expect(201);
    const token = linkResponse.body.data.url.split('start=')[1];
    await handleTelegramUpdate({ message: { from: { id: 12345, username: 'alice' }, chat: { id: 12345 }, text: `/start ${token}` } });
    expect(await TelegramConnection.countDocuments({ user: a.user._id, telegramUserId: '12345' })).toBe(1);
    await handleTelegramUpdate({ message: { from: { id: 12345 }, chat: { id: 12345 }, text: `/start ${token}` } });
    expect(await TelegramConnection.countDocuments()).toBe(1);
    const otherToken = (await b.agent.post('/api/telegram-link').expect(201)).body.data.url.split('start=')[1];
    await handleTelegramUpdate({ message: { from: { id: 12345 }, chat: { id: 12345 }, text: `/start ${otherToken}` } });
    expect(await TelegramConnection.countDocuments()).toBe(1);
    const expiredToken = (await b.agent.post('/api/telegram-link').expect(201)).body.data.url.split('start=')[1];
    await TelegramLinkToken.updateMany({ user: b.user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await handleTelegramUpdate({ message: { from: { id: 99999 }, chat: { id: 99999 }, text: `/start ${expiredToken}` } });
    expect(await TelegramConnection.countDocuments()).toBe(1);
    const account = (await a.agent.post('/api/accounts').send({ name: 'Cash', type: 'cash' }).expect(201)).body.data;
    await a.agent.patch('/api/settings').send({ telegram: { defaultExpenseAccount: account._id } }).expect(200);
    await handleTelegramUpdate({ message: { from: { id: 12345 }, chat: { id: 12345 }, text: 'spent 500 coffee' } });
    expect(await Transaction.countDocuments({ user: a.user._id, type: 'expense', amount: 500 })).toBe(1);
    expect(await Transaction.countDocuments({ user: b.user._id })).toBe(0);
    await AccessSubscription.updateMany({ user: a.user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await handleTelegramUpdate({ message: { from: { id: 12345 }, chat: { id: 12345 }, text: 'spent 500 coffee' } });
    expect(await Transaction.countDocuments({ user: a.user._id })).toBe(1);
    const renewal = await makeLink();
    await a.agent.post(`/api/activation/${renewal.key}/activate`).expect(200);
    await handleTelegramUpdate({ message: { from: { id: 12345 }, chat: { id: 12345 }, text: 'spent 500 coffee' } });
    expect(await Transaction.countDocuments({ user: a.user._id })).toBe(2);
  });

  it('migrates existing records once without deleting them', async () => {
    await Account.collection.insertOne({ name: 'Legacy Cash', type: 'cash', openingBalance: 100 });
    await Task.collection.insertOne({ title: 'Legacy Task' });
    await Setting.collection.insertOne({ singletonKey: 'primary', name: 'Legacy Workspace', telegram: { allowedTelegramUserIds: [98765] } });
    const first = await migrateLegacy();
    const second = await migrateLegacy();
    const owner = await User.findOne({ email: 'legacy@example.com' });
    expect(first.assigned.Account).toBe(1);
    expect(second.assigned.Account).toBe(0);
    expect(await Account.countDocuments({ user: owner._id })).toBe(1);
    expect(await Task.countDocuments({ user: owner._id })).toBe(1);
    expect((await Setting.findOne({ user: owner._id })).name).toBe('Legacy Workspace');
    expect(await TelegramConnection.countDocuments({ user: owner._id })).toBe(1);
    expect(await AccessSubscription.countDocuments({ user: owner._id })).toBe(1);
  });

  it('stops unsafe legacy Telegram migration without erasing the old UIDs', async () => {
    await Setting.collection.insertOne({ singletonKey: 'primary', telegram: { allowedTelegramUserIds: [111, 222] } });
    await expect(migrateLegacy()).rejects.toThrow('Multiple legacy Telegram UIDs');
    const row = await Setting.collection.findOne({ singletonKey: 'primary' });
    expect(row.telegram.allowedTelegramUserIds).toEqual([111, 222]);
  });
});
