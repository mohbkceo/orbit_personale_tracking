import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Account } from '../src/models/Account.js';
import { Transaction } from '../src/models/Transaction.js';

let mongo;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => Promise.all([Account.deleteMany(), Transaction.deleteMany()]));

describe('REST API', () => {
  it('reports health using the common response envelope', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('creates expenses through the resource alias and derives the account balance', async () => {
    const account = await Account.create({ name: 'Cash', type: 'cash', openingBalance: 1000 });
    await request(app).post('/api/expenses').send({ amount: 250, accountId: String(account._id), description: 'Groceries', category: 'Food' }).expect(201);
    const response = await request(app).get('/api/accounts').expect(200);
    expect(response.body.data[0].currentBalance).toBe(750);
    expect(await Transaction.countDocuments({ type: 'expense' })).toBe(1);
  });

  it('returns useful validation errors', async () => {
    const response = await request(app).post('/api/tasks').send({ title: '' }).expect(422);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Validation failed');
  });
});
