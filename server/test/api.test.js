import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Account } from '../src/models/Account.js';
import { Transaction } from '../src/models/Transaction.js';
import { User } from '../src/models/User.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { env } from '../src/config/env.js';
import { Reminder } from '../src/models/Reminder.js';
import { Task } from '../src/models/Task.js';
import { Setting } from '../src/models/Setting.js';
import { backfillAppearance } from '../src/scripts/backfillAppearance.js';

let mongo;
let user;
let cookie;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Account.deleteMany(), Transaction.deleteMany(), User.deleteMany(), AccessSubscription.deleteMany(), Reminder.deleteMany(), Task.deleteMany()]);
  user = await User.create({ fullName: 'Owner', email: 'owner@example.com', passwordHash: 'unused' });
  await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
  cookie = `orbit_user=${jwt.sign({ sub: String(user._id), type: 'user' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
});

describe('REST API', () => {
  it('keeps legacy users and legacy color modes usable', async () => {
    const identity = await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);
    expect(identity.body.data.user.gender).toBeNull();
    await Setting.create({ user: user._id, theme: 'dark' });
    const settings = await request(app).get('/api/settings').set('Cookie', cookie).expect(200);
    expect(settings.body.data.appearance).toMatchObject({ mode: 'dark', preset: 'orbit', density: 'comfortable', radius: 'soft', motion: 'full', personality: 'balanced' });
    await backfillAppearance();
    expect((await Setting.collection.findOne({ user: user._id })).appearance.mode).toBe('dark');
    expect((await Setting.findOne({ user: user._id })).theme).toBe('dark');
    await request(app).get('/api/dashboard/summary').set('Cookie', cookie).expect(200);
  });

  it('validates and persists profile gender independently of workspace settings', async () => {
    await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ gender: 'OTHER' }).expect(422);
    await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ gender: 'MALE' }).expect(200);
    expect((await User.findById(user._id)).gender).toBe('MALE');
    const changed = await request(app).patch('/api/auth/me').set('Cookie', cookie).send({ gender: 'FEMALE' }).expect(200);
    expect(changed.body.data.user.gender).toBe('FEMALE');
  });

  it('persists appearance, validates every field and keeps old theme clients working', async () => {
    const appearance = { mode: 'light', preset: 'rose-quartz', density: 'compact', radius: 'rounded', motion: 'reduced', personality: 'focus' };
    const saved = await request(app).patch('/api/settings').set('Cookie', cookie).send({ appearance }).expect(200);
    expect(saved.body.data.appearance).toEqual(appearance);
    expect((await Setting.findOne({ user: user._id })).theme).toBe('light');
    expect((await request(app).get('/api/settings').set('Cookie', cookie).expect(200)).body.data.appearance).toEqual(appearance);
    for (const [field, invalid] of Object.entries({ mode: 'nope', preset: 'unknown', density: 'tiny', radius: 'square', motion: 'wild', personality: 'chaotic' })) {
      await request(app).patch('/api/settings').set('Cookie', cookie).send({ appearance: { [field]: invalid } }).expect(422);
    }
    await request(app).patch('/api/settings').set('Cookie', cookie).send({ appearance: { extra: 'bad' } }).expect(422);
    const old = await request(app).patch('/api/settings').set('Cookie', cookie).send({ theme: 'system' }).expect(200);
    expect(old.body.data.appearance).toMatchObject({ mode: 'system', preset: 'rose-quartz', personality: 'focus' });
  });
  it('never returns a legacy Telegram webhook secret in public settings', async () => {
    const settings = await Setting.create({ user: user._id });
    await Setting.collection.updateOne({ _id: settings._id }, { $set: { 'telegram.webhookUrl': '/api/telegram/webhook/private-secret', 'telegram.encryptedBotToken': 'cipher', 'telegram.iv': 'iv', 'telegram.authTag': 'tag' } });
    const response = await request(app).get('/api/settings').set('Cookie', cookie).expect(200);
    expect(JSON.stringify(response.body)).not.toContain('private-secret');
    expect(JSON.stringify(response.body)).not.toContain('cipher');
    expect(response.body.data.telegram).not.toHaveProperty('webhookUrl');
  });
  it('reports health using the common response envelope', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('creates expenses through the resource alias and derives the account balance', async () => {
    const account = await Account.create({ user: user._id, name: 'Cash', type: 'cash', openingBalance: 1000 });
    await request(app).post('/api/expenses').set('Cookie', cookie).send({ amount: 250, accountId: String(account._id), description: 'Groceries', category: 'Food' }).expect(201);
    const response = await request(app).get('/api/accounts').set('Cookie', cookie).expect(200);
    expect(response.body.data[0].currentBalance).toBe(750);
    expect(await Transaction.countDocuments({ type: 'expense' })).toBe(1);
  });

  it('returns useful validation errors', async () => {
    const response = await request(app).post('/api/tasks').set('Cookie', cookie).send({ title: '' }).expect(422);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
  });

  it('creates and manages a standalone reminder through the authenticated API', async () => {
    const at = new Date(Date.now() + 3600000).toISOString();
    const created = await request(app).post('/api/reminders').set('Cookie', cookie).send({ title: 'Bring passport', trigger: { type: 'datetime', at } }).expect(201);
    const id = created.body.data._id;
    expect(created.body.data.entityType).toBe('custom');
    const listed = await request(app).get('/api/reminders').set('Cookie', cookie).expect(200);
    expect(listed.body.data.some((item) => item._id === id)).toBe(true);
    await request(app).post(`/api/reminders/${id}/block`).set('Cookie', cookie).send({ reason: 'waiting_for_info' }).expect(200);
    await request(app).post(`/api/reminders/${id}/resume`).set('Cookie', cookie).send({}).expect(200);
    await request(app).post(`/api/reminders/${id}/snooze`).set('Cookie', cookie).send({ until: new Date(Date.now() + 7200000) }).expect(200);
    await request(app).post(`/api/reminders/${id}/complete`).set('Cookie', cookie).send({}).expect(200);
    expect((await Reminder.findById(id)).status).toBe('completed');
    await request(app).post('/api/reminders').set('Cookie', cookie).send({ title: 'Bad time', trigger: { type: 'datetime', at: 'not-a-date' } }).expect(422);
    await request(app).get('/api/reminders?entityId=wrong').set('Cookie', cookie).expect(400);
    await request(app).get('/api/reminders').expect(401);
  });

  it('updates a linked task reminder mode without exposing another entity', async () => {
    const task = await request(app).post('/api/tasks').set('Cookie', cookie).send({ title: 'Call dentist', dueDate: new Date(Date.now() + 86400000) }).expect(201);
    const id = task.body.data._id;
    expect((await request(app).get(`/api/reminders/entity/task/${id}`).set('Cookie', cookie).expect(200)).body.data).toHaveLength(1);
    await request(app).patch(`/api/reminders/entity/task/${id}/mode`).set('Cookie', cookie).send({ mode: 'off' }).expect(200);
    expect((await request(app).get(`/api/reminders/entity/task/${id}`).set('Cookie', cookie).expect(200)).body.data.filter((item) => item.status === 'scheduled')).toHaveLength(0);
    await request(app).patch(`/api/reminders/entity/task/${id}/mode`).set('Cookie', cookie).send({ mode: 'automatic' }).expect(200);
    expect((await request(app).get(`/api/reminders/entity/task/${id}`).set('Cookie', cookie).expect(200)).body.data.filter((item) => item.status === 'scheduled')).toHaveLength(1);
    await request(app).get(`/api/reminders/entity/task/${new mongoose.Types.ObjectId()}/mode`).set('Cookie', cookie).expect(404);
  });
});
