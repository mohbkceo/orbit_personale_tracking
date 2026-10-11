import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import QRCode from 'qrcode';
import { Writable } from 'node:stream';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { ActivationLink } from '../src/models/ActivationLink.js';
import { Admin } from '../src/models/Admin.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Plan } from '../src/models/Plan.js';
import { QrBatch } from '../src/models/QrBatch.js';
import { QrPrintTemplate } from '../src/models/QrPrintTemplate.js';
import { env } from '../src/config/env.js';
import { activePrintExports, preparePrintBatch, reservePrintExport, resolvePrintText, samplePrintRow, streamPrintPdf } from '../src/services/qrPrintPdfService.js';

let mongo; let admin; let plan; let cookie;
const baseElement = { id: 'b13c4edc-cf65-41a4-b744-743fd67ab91e', type: 'qr', x: 65, y: 8, w: 32, h: 32,
  rotation: 0, opacity: 1, locked: false, foreground: '#111111', background: '#ffffff' };
const templateBody = () => ({ name: 'Retail card', widthMm: 97, heightMm: 55,
  background: { type: 'color', color: '#ffffff' }, elements: [baseElement,
    { id: '6fa158b0-2672-4492-81d3-79466ef34aa7', type: 'variable', variable: 'ACTIVATION_CODE',
      x: 3, y: 40, w: 60, h: 10, rotation: 0, opacity: 1, locked: false, color: '#111111', fontFamily: 'Noto Sans', fontSize: 9, fontWeight: 'bold', align: 'left' }] });
const auth = (path) => request(app).post(path).set('Cookie', cookie);
const binaryParser = (response, callback) => { const chunks = []; response.on('data', (chunk) => chunks.push(chunk)); response.on('end', () => callback(null, Buffer.concat(chunks))); };

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
  await Promise.all([Admin.init(), Plan.init(), QrBatch.init(), QrPrintTemplate.init(), ActivationLink.init(), AuditLog.init()]);
});
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([ActivationLink.deleteMany(), QrBatch.deleteMany(), QrPrintTemplate.deleteMany(), Plan.deleteMany(), Admin.deleteMany(), AuditLog.deleteMany()]);
  admin = await Admin.create({ fullName: 'Print Admin', email: 'print@example.com', passwordHash: 'unused', role: 'ADMIN' });
  plan = await Plan.create({ name: 'Annual', durationValue: 1, durationUnit: 'YEAR', createdBy: admin._id });
  cookie = `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
});

describe('QR Print Studio', () => {
  it('protects template and PDF APIs', async () => {
    await request(app).get('/api/admin/qr-print-templates').expect(401);
    await request(app).post('/api/admin/qr-print-templates').send(templateBody()).expect(401);
    await request(app).get('/api/admin/qr-batches/507f1f77bcf86cd799439011/print.pdf').expect(401);
  });
  it('creates, persists, versions, duplicates and validates editable templates without links', async () => {
    const created = await auth('/api/admin/qr-print-templates').send(templateBody()).expect(201);
    const id = created.body.data._id;
    expect(await ActivationLink.countDocuments()).toBe(0);
    expect((await request(app).get(`/api/admin/qr-print-templates/${id}`).set('Cookie', cookie).expect(200)).body.data.elements).toHaveLength(2);
    const changed = await request(app).patch(`/api/admin/qr-print-templates/${id}`).set('Cookie', cookie).send({ ...templateBody(), name: 'Revised' }).expect(200);
    expect(changed.body.data.version).toBe(2);
    const duplicate = await auth(`/api/admin/qr-print-templates/${id}/duplicate`).expect(201);
    expect(duplicate.body.data.version).toBe(1);
    expect(duplicate.body.data.name).toContain('copy');
    await auth('/api/admin/qr-print-templates').send({ ...templateBody(), elements: [{ ...baseElement, x: 96 }] }).expect(422);
    await auth('/api/admin/qr-print-templates').send({ ...templateBody(), elements: [{ ...baseElement, foreground: '#eeeeee' }] }).expect(422);
    const previewBody = templateBody();
    previewBody.elements.push(...['Noto Serif', 'Noto Sans Mono'].map((fontFamily, index) => ({
      id: index ? '75198da9-e6d1-490c-ad29-7d0348ec64f0' : '7311d8da-f004-4478-a4c5-597e2267c13c',
      type: 'text', text: fontFamily, x: 3, y: 5 + index * 10, w: 42, h: 8,
      rotation: 0, opacity: 1, locked: false, color: '#111111', fontFamily,
      fontSize: 10, fontWeight: 'bold', align: 'left',
    })));
    const preview = await auth('/api/admin/qr-print-templates/preview.pdf').send(previewBody).buffer(true).parse(binaryParser).expect(200);
    expect((await PDFDocument.load(preview.body)).getPageCount()).toBe(1);
    previewBody.elements[previewBody.elements.length - 1].text = 'مرحبا';
    await auth('/api/admin/qr-print-templates/preview.pdf').send(previewBody).expect(422);
    expect(await ActivationLink.countDocuments()).toBe(0);
  });
  it('sanitizes private artwork and protects referenced assets', async () => {
    const png = await sharp({ create: { width: 20, height: 10, channels: 4, background: '#0000ff' } }).png().toBuffer();
    const upload = await auth('/api/admin/qr-print-templates/assets').set('Content-Type', 'image/png').send(png).expect(201);
    const assetId = upload.body.data._id;
    await request(app).get(`/api/admin/qr-print-templates/assets/${assetId}`).expect(401);
    const received = await request(app).get(`/api/admin/qr-print-templates/assets/${assetId}`).set('Cookie', cookie).buffer(true).parse(binaryParser).expect(200);
    expect((await sharp(received.body).metadata()).width).toBe(20);
    await auth('/api/admin/qr-print-templates/assets').set('Content-Type', 'image/jpeg').send(png).expect(422);
    await auth('/api/admin/qr-print-templates/assets').set('Content-Type', 'image/png').send(Buffer.from('<svg/>')).expect(422);
    const body = templateBody(); body.elements.push({ id: '5b2fef6b-3467-4a8b-b650-c7a76b280a63', type: 'image', assetId,
      x: 3, y: 3, w: 20, h: 10, rotation: 0, opacity: 1, locked: false, cropX: 0, cropY: 0, cropW: 1, cropH: 1 });
    await auth('/api/admin/qr-print-templates').send(body).expect(201);
    await request(app).delete(`/api/admin/qr-print-templates/assets/${assetId}`).set('Cookie', cookie).expect(409);
  });
  it('prints exactly 100 existing secure links at physical size and locks the design snapshot', async () => {
    const template = (await auth('/api/admin/qr-print-templates').send(templateBody()).expect(201)).body.data;
    const batch = (await auth('/api/admin/qr-batches').send({ name: 'Print run', planId: String(plan._id), templateId: template._id,
      quantity: 100, noExpiry: true, note: '' }).expect(201)).body.data.batch;
    expect(batch.printSnapshot.version).toBe(1);
    expect(await ActivationLink.countDocuments({ qrBatch: batch._id })).toBe(100);
    expect(await ActivationLink.countDocuments({ qrBatch: batch._id, expiresAt: null })).toBe(100);
    const prepared = await preparePrintBatch(batch._id);
    expect(new Set(prepared.rows.map((row) => row.url)).size).toBe(100);
    expect(prepared.rows[0].code).toBe(`ORB-${batch.code}-001`);
    expect(prepared.rows[99].code).toBe(`ORB-${batch.code}-100`);
    expect(prepared.rows.every((row) => row.plan === 'Annual' && row.duration === '1 YEAR')).toBe(true);
    await request(app).patch(`/api/admin/qr-print-templates/${template._id}`).set('Cookie', cookie).send({ ...templateBody(), name: 'New design' }).expect(200);
    const pdf = await request(app).get(`/api/admin/qr-batches/${batch._id}/print.pdf`).set('Cookie', cookie).buffer(true).parse(binaryParser).expect(200);
    expect(pdf.headers['cache-control']).toBe('no-store');
    const parsed = await PDFDocument.load(pdf.body);
    expect(parsed.getPageCount()).toBe(100);
    const { width, height } = parsed.getPage(0).getSize();
    expect(width).toBeCloseTo(97 * 72 / 25.4, 3);
    expect(height).toBeCloseTo(55 * 72 / 25.4, 3);
    for (const [index, page] of parsed.getPages().entries()) {
      const stream = parsed.context.lookup(page.node.Contents());
      const commands = Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8');
      const matrix = QRCode.create(prepared.rows[index].url, { errorCorrectionLevel: 'M' }).modules;
      const cell = (32 * 72 / 25.4) / (matrix.size + 8);
      const modules = new Set();
      for (const match of commands.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/g)) {
        if (Math.abs(Number(match[3]) - cell - 0.02) > 0.001 || Math.abs(Number(match[4]) - cell - 0.02) > 0.001) continue;
        modules.add(`${Math.round(Number(match[2]) / cell - 4)},${Math.round(Number(match[1]) / cell - 4)}`);
      }
      let expected = 0;
      for (let row = 0; row < matrix.size; row += 1) for (let col = 0; col < matrix.size; col += 1)
        if (matrix.get(row, col)) { expected += 1; expect(modules.has(`${row},${col}`)).toBe(true); }
      expect(modules.size).toBe(expected);
      expect(resolvePrintText('{{ACTIVATION_CODE}}', prepared.rows[index])).toBe(prepared.rows[index].code);
    }
    expect((await QrBatch.findById(batch._id)).printSnapshot.name).toBe('Retail card');
    expect(await ActivationLink.countDocuments({ qrBatch: batch._id })).toBe(100);
  }, 90_000);
  it('rejects used, revoked and expired links before sending a PDF', async () => {
    const template = (await auth('/api/admin/qr-print-templates').send(templateBody()).expect(201)).body.data;
    for (const status of ['USED', 'REVOKED', 'EXPIRED']) {
      const batch = (await auth('/api/admin/qr-batches').send({ name: status, planId: String(plan._id), templateId: template._id,
        quantity: 2, validityDays: 7, noExpiry: false }).expect(201)).body.data.batch;
      await ActivationLink.updateOne({ qrBatch: batch._id, batchSequence: 1 }, { $set: { status } });
      const result = await request(app).get(`/api/admin/qr-batches/${batch._id}/print.pdf`).set('Cookie', cookie).expect(409);
      expect(result.headers['content-type']).toMatch(/json/);
    }
  });
  it('attaches a template to a legacy batch without creating links and keeps historical artwork', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 4, background: '#00ff00' } }).png().toBuffer();
    const assetId = (await auth('/api/admin/qr-print-templates/assets').set('Content-Type', 'image/png').send(png).expect(201)).body.data._id;
    const body = templateBody(); body.background = { type: 'image', assetId };
    const template = (await auth('/api/admin/qr-print-templates').send(body).expect(201)).body.data;
    const batch = (await auth('/api/admin/qr-batches').send({ name: 'Legacy print', planId: String(plan._id), quantity: 2, validityDays: 30 }).expect(201)).body.data.batch;
    const before = await ActivationLink.countDocuments({ qrBatch: batch._id });
    await auth(`/api/admin/qr-batches/${batch._id}/print-template`).send({ templateId: template._id }).expect(200);
    await auth(`/api/admin/qr-batches/${batch._id}/print-template`).send({ templateId: template._id }).expect(409);
    expect(await ActivationLink.countDocuments({ qrBatch: batch._id })).toBe(before);
    await request(app).delete(`/api/admin/qr-print-templates/${template._id}`).set('Cookie', cookie).expect(200);
    await request(app).delete(`/api/admin/qr-print-templates/assets/${assetId}`).set('Cookie', cookie).expect(409);
    await request(app).get(`/api/admin/qr-batches/${batch._id}/print.pdf`).set('Cookie', cookie).buffer(true).parse(binaryParser).expect(200);
  });
  it('stops a PDF stream when the client disconnects', async () => {
    const output = new Writable({ write(_chunk, _encoding, callback) { callback(); this.destroy(new Error('Client disconnected')); } });
    await expect(streamPrintPdf(output, templateBody(), [samplePrintRow])).rejects.toThrow();
  });
  it('resolves variables and limits concurrent PDF exports', () => {
    expect(resolvePrintText('{{ACTIVATION_CODE}} / {{CARD_NUMBER}}', { code: 'CARD-1', sequence: 1 })).toBe('CARD-1 / 1');
    const release1 = reservePrintExport(); const release2 = reservePrintExport();
    expect(activePrintExports()).toBe(2);
    expect(() => reservePrintExport()).toThrow();
    release1(); release2(); release2();
    expect(activePrintExports()).toBe(0);
  });
});
