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

let mongo;
let user;
let cookie;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Account.deleteMany(), Transaction.deleteMany(), User.deleteMany(), AccessSubscription.deleteMany()]);
  user = await User.create({ fullName: 'Owner', email: 'owner@example.com', passwordHash: 'unused' });
  await AccessSubscription.create({ user: user._id, plan: new mongoose.Types.ObjectId(), activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), planSnapshot: { name: 'Day', durationValue: 1, durationUnit: 'DAY' } });
  cookie = `orbit_user=${jwt.sign({ sub: String(user._id), type: 'user' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
});

describe('REST API', () => {
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
});
