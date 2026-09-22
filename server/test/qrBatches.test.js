import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { ActivationLink } from '../src/models/ActivationLink.js';
import { Admin } from '../src/models/Admin.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Plan } from '../src/models/Plan.js';
import { QrBatch } from '../src/models/QrBatch.js';
import { env } from '../src/config/env.js';

let mongo;
let admin;
let plan;
let cookie;

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function createBatch(overrides = {}) {
  return request(app)
    .post('/api/admin/qr-batches')
    .set('Cookie', cookie)
    .send({
      name: 'September rollout',
      planId: String(plan._id),
      quantity: 4,
      validityDays: 30,
      note: 'Retail cards',
      qrFormat: 'PNG',
      qrSize: 512,
      ...overrides,
    })
    .expect(201);
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
  await Promise.all([
    Admin.init(),
    Plan.init(),
    QrBatch.init(),
    ActivationLink.init(),
    AuditLog.init(),
  ]);
});

afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    ActivationLink.deleteMany(),
    QrBatch.deleteMany(),
    Plan.deleteMany(),
    Admin.deleteMany(),
    AuditLog.deleteMany(),
  ]);
  admin = await Admin.create({
    fullName: 'Batch Admin',
    email: 'batch@example.com',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  plan = await Plan.create({
    name: 'Annual',
    durationValue: 1,
    durationUnit: 'YEAR',
    createdBy: admin._id,
  });
  cookie = `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
});

describe('admin QR batches', () => {
  it('requires admin authentication for every endpoint', async () => {
    const id = '507f1f77bcf86cd799439011';
    await request(app).get('/api/admin/qr-batches').expect(401);
    await request(app).post('/api/admin/qr-batches').send({}).expect(401);
    await request(app).get(`/api/admin/qr-batches/${id}`).expect(401);
    await request(app).get(`/api/admin/qr-batches/${id}/download`).expect(401);
    await request(app).get(`/api/admin/qr-batches/${id}/export.csv`).expect(401);
    await request(app).post(`/api/admin/qr-batches/${id}/revoke-unused`).expect(401);
  });

  it('creates the exact quantity with unique secure tokens and unique batch codes', async () => {
    const first = await createBatch();
    const second = await createBatch({ quantity: 2 });
    const firstBatch = first.body.data.batch;
    const secondBatch = second.body.data.batch;
    const links = await ActivationLink.find({ qrBatch: firstBatch._id })
      .select('+tokenHash')
      .sort({ batchSequence: 1 });

    expect(first.body.data.stats).toMatchObject({
      total: 4,
      active: 4,
      used: 0,
      expired: 0,
      revoked: 0,
    });
    expect(links).toHaveLength(4);
    expect(new Set(links.map((link) => link.tokenHash)).size).toBe(4);
    expect(new Set(links.map((link) => link.batchCode)).size).toBe(4);
    expect(links.map((link) => link.batchCode)).toEqual([
      `ORB-${firstBatch.code}-001`,
      `ORB-${firstBatch.code}-002`,
      `ORB-${firstBatch.code}-003`,
      `ORB-${firstBatch.code}-004`,
    ]);
    expect(secondBatch.code).not.toBe(firstBatch.code);
    expect(await AuditLog.countDocuments({ event: 'QR_BATCH_CREATED' })).toBe(2);

    const listed = await request(app)
      .get(`/api/admin/qr-batches?search=${firstBatch.code}`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body.data.map((batch) => batch._id)).toEqual([firstBatch._id]);
    const searchedLinks = await request(app)
      .get(`/api/admin/qr-batches/${firstBatch._id}?search=${firstBatch.code}-002`)
      .set('Cookie', cookie)
      .expect(200);
    expect(searchedLinks.body.data.links).toHaveLength(1);
    expect(searchedLinks.body.data.links[0].batchCode).toBe(`ORB-${firstBatch.code}-002`);
  });

  it('generates a ZIP with QR files and a manifest, and exports CSV without encrypted fields', async () => {
    const created = await createBatch({ quantity: 2 });
    const batch = created.body.data.batch;
    const zip = await request(app)
      .get(`/api/admin/qr-batches/${batch._id}/download`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)
      .expect('Content-Type', /application\/zip/);

    expect(Buffer.isBuffer(zip.body)).toBe(true);
    expect(zip.body.subarray(0, 2).toString()).toBe('PK');
    const archiveText = zip.body.toString('latin1');
    expect(archiveText).toContain('QR-001.png');
    expect(archiveText).toContain('QR-002.png');
    expect(archiveText).toContain('manifest.csv');

    const csv = await request(app)
      .get(`/api/admin/qr-batches/${batch._id}/export.csv`)
      .set('Cookie', cookie)
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    expect(csv.text).toContain('Code,Plan,Status,ExpiresAt,URL');
    expect(csv.text).toContain(`ORB-${batch.code}-001,Annual,ACTIVE`);
    expect(csv.text).toContain('/activate/');
    expect(csv.text).not.toContain('encryptedToken');
    expect(
      await AuditLog.countDocuments({ event: 'QR_BATCH_DOWNLOADED', targetId: batch._id }),
    ).toBe(1);

    const svgBatch = (await createBatch({ name: 'SVG cards', quantity: 1, qrFormat: 'SVG' })).body
      .data.batch;
    const svgZip = await request(app)
      .get(`/api/admin/qr-batches/${svgBatch._id}/download`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(svgZip.body.toString('latin1')).toContain('QR-001.svg');
  });

  it('revokes only unused active links and never revokes used links', async () => {
    const created = await createBatch({ quantity: 3 });
    const batch = created.body.data.batch;
    const used = await ActivationLink.findOneAndUpdate(
      { qrBatch: batch._id, batchSequence: 1 },
      { $set: { status: 'USED', activatedAt: new Date() } },
      { new: true },
    );

    const response = await request(app)
      .post(`/api/admin/qr-batches/${batch._id}/revoke-unused`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body.data.revokedCount).toBe(2);
    expect((await ActivationLink.findById(used._id)).status).toBe('USED');
    expect(await ActivationLink.countDocuments({ qrBatch: batch._id, status: 'REVOKED' })).toBe(2);
    expect(response.body.data.stats).toMatchObject({ total: 3, active: 0, used: 1, revoked: 2 });
    expect(
      await AuditLog.countDocuments({ event: 'QR_BATCH_UNUSED_REVOKED', targetId: batch._id }),
    ).toBe(1);
    const csv = await request(app)
      .get(`/api/admin/qr-batches/${batch._id}/export.csv`)
      .set('Cookie', cookie)
      .expect(200);
    expect(csv.text).not.toContain('/activate/');
  });

  it('rejects quantities greater than 500', async () => {
    await request(app)
      .post('/api/admin/qr-batches')
      .set('Cookie', cookie)
      .send({
        name: 'Too many',
        planId: String(plan._id),
        quantity: 501,
        validityDays: 7,
        note: '',
        qrFormat: 'PNG',
        qrSize: 512,
      })
      .expect(422);
    expect(await QrBatch.countDocuments()).toBe(0);
    expect(await ActivationLink.countDocuments()).toBe(0);
  });
});
