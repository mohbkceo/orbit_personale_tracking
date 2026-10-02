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
    expect(empty.body.data).toEqual({ sales: { whatsappNumber: '', whatsappMessage: '', salesEmail: '', supportEmail: '', phoneNumber: '', whatsappEnabled: true, contactVisible: false } });
    await SiteConfig.collection.insertOne({
      key: 'site',
      sales: { whatsappNumber: '213555123456', whatsappMessage: 'Hello', token: 'private' },
      webhookSecret: 'private',
    });
    const response = await request(app).get('/api/public/config').expect(200);
    expect(response.body.data).toEqual({
      sales: { whatsappNumber: '213555123456', whatsappMessage: 'Hello', salesEmail: '', supportEmail: '', phoneNumber: '', whatsappEnabled: true, contactVisible: false },
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
      salesEmail: '', supportEmail: '', phoneNumber: '', whatsappEnabled: true, contactVisible: false,
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

  it('saves contact fields, hides them until enabled, and preserves them for legacy updates', async () => {
    const path = '/api/admin/settings/sales';
    const full = { whatsappNumber: '+213 555 123 456', whatsappMessage: 'Hello', salesEmail: 'SALES@example.com', supportEmail: 'help@example.com', phoneNumber: '+213 555 777 888', whatsappEnabled: false, contactVisible: false };
    await request(app).put(path).set('Cookie', superCookie).send({ ...full, salesEmail: 'invalid' }).expect(422);
    const saved = (await request(app).put(path).set('Cookie', superCookie).send(full).expect(200)).body.data;
    expect(saved).toMatchObject({ salesEmail: 'sales@example.com', supportEmail: 'help@example.com', whatsappEnabled: false, contactVisible: false });
    const hidden = (await request(app).get('/api/public/config').expect(200)).body.data.sales;
    expect(hidden).toMatchObject({ salesEmail: '', supportEmail: '', phoneNumber: '', whatsappEnabled: false });
    await request(app).put(path).set('Cookie', superCookie).send({ whatsappNumber: full.whatsappNumber, whatsappMessage: full.whatsappMessage }).expect(200);
    const retained = (await request(app).get('/api/admin/settings').set('Cookie', superCookie).expect(200)).body.data.sales;
    expect(retained.salesEmail).toBe('sales@example.com');
    expect(retained.whatsappEnabled).toBe(false);
    await request(app).put(path).set('Cookie', superCookie).send({ ...full, contactVisible: true }).expect(200);
    const visible = (await request(app).get('/api/public/config').expect(200)).body.data.sales;
    expect(visible).toMatchObject({ salesEmail: 'sales@example.com', supportEmail: 'help@example.com', phoneNumber: full.phoneNumber, contactVisible: true });
  });
});
