import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Admin } from '../src/models/Admin.js';
import { SiteConfig } from '../src/models/SiteConfig.js';
import { env } from '../src/config/env.js';

let mongo;
let superCookie;
let adminCookie;
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await Promise.all([Admin.init(), SiteConfig.init()]);
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([Admin.deleteMany(), SiteConfig.deleteMany()]);
  const chief = await Admin.create({
    fullName: 'Chief',
    email: 'chief@example.com',
    passwordHash: 'unused',
    role: 'SUPER_ADMIN',
  });
  const assistant = await Admin.create({
    fullName: 'Assistant',
    email: 'assistant@example.com',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  const cookie = (id) =>
    `orbit_admin=${jwt.sign({ sub: String(id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
  superCookie = cookie(chief._id);
  adminCookie = cookie(assistant._id);
});

describe('public sales configuration', () => {
  it('exposes only safe fields and handles missing configuration', async () => {
    const empty = await request(app).get('/api/public/config').expect(200);
    expect(empty.body.data).toEqual({ sales: { whatsappNumber: '', whatsappMessage: '' } });
    await SiteConfig.collection.insertOne({
      key: 'site',
      sales: { whatsappNumber: '213555123456', whatsappMessage: 'Hello', token: 'private' },
      webhookSecret: 'private',
    });
    const response = await request(app).get('/api/public/config').expect(200);
    expect(response.body.data).toEqual({
      sales: { whatsappNumber: '213555123456', whatsappMessage: 'Hello' },
    });
    expect(JSON.stringify(response.body)).not.toContain('private');
    await request(app).put('/api/public/config').send({ sales: {} }).expect(401);
  });

  it('requires super admin and validates the phone number', async () => {
    const path = '/api/admin/settings/sales';
    const body = { whatsappNumber: '+213 555 123 456', whatsappMessage: 'Hello, I want Orbit.' };
    await request(app).put(path).send(body).expect(401);
    await request(app).put(path).set('Cookie', adminCookie).send(body).expect(403);
    await request(app)
      .put(path)
      .set('Cookie', superCookie)
      .send({ ...body, whatsappNumber: '123' })
      .expect(422);
    await request(app)
      .put(path)
      .set('Cookie', superCookie)
      .send({ ...body, extra: 'secret' })
      .expect(422);
    const saved = await request(app).put(path).set('Cookie', superCookie).send(body).expect(200);
    expect(saved.body.data).toEqual({
      whatsappNumber: '213555123456',
      whatsappMessage: body.whatsappMessage,
    });
    expect(
      (await request(app).get('/api/admin/settings').set('Cookie', superCookie).expect(200)).body
        .data.sales,
    ).toEqual(saved.body.data);
    expect((await request(app).get('/api/public/config').expect(200)).body.data.sales).toEqual(
      saved.body.data,
    );
    expect((await SiteConfig.findOne({ key: 'site' })).sales.whatsappNumber).toBe('213555123456');
  });
});
