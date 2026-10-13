import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Admin } from '../src/models/Admin.js';
import { Plan } from '../src/models/Plan.js';
import { Feature } from '../src/models/Feature.js';
import { Setting } from '../src/models/Setting.js';
import { AccessSubscription } from '../src/models/AccessSubscription.js';
import { PaymentOrder } from '../src/models/PaymentOrder.js';
import { AdvertisingConsent } from '../src/models/AdvertisingConsent.js';
import { AnalyticsEvent } from '../src/models/AnalyticsEvent.js';
import { AnalyticsSession } from '../src/models/AnalyticsSession.js';
import { AnalyticsVisitor } from '../src/models/AnalyticsVisitor.js';
import { deliverMeta, matchingData, sha256 } from '../src/analytics/metaProvider.js';
import { verifyInvoiceResponse, paymentsAvailable } from '../src/services/slickpayProvider.js';
import { migrateCommerce } from '../src/scripts/migrateCommerce.js';
import { decryptSecret } from '../src/utils/crypto.js';
import { createActivationLink } from '../src/services/activationService.js';

let mongo; let plan; let admin; let agent; let user;
const originalEnv = { ...env };
const billing = { firstname: 'Test', lastname: 'Customer', phone: '+213555123456', address: 'Algiers, Algeria' };
const signup = { fullName: 'Test Customer', email: 'customer@example.com', password: 'a-long-secure-password' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const invoice = (id = 123) => ({ success: 1, id, url: `https://devapi.slick-pay.com/api/v2/users/invoices/satim/payment/REF${id}` });
const paid = (amount = 2500, serial = 'PAY123') => ({ success: 1, data: { completed: 1, serial, transaction: { amount } } });
async function register({ ads = false } = {}) {
  agent = request.agent(app);
  await agent.post('/api/analytics/session').send({ landingUrl: 'https://orbit.test/?utm_source=meta&utm_medium=cpc&utm_campaign=launch&fbclid=realclick', entry: true }).expect(200);
  if (ads) await agent.post('/api/analytics/advertising-consent').send({ granted: true }).expect(200);
  const result = await agent.post('/api/auth/register').set('User-Agent', 'Orbit test browser').set('X-Orbit-Fbp', 'fb.1.1780000000000.1234').send(signup).expect(201);
  user = await User.findById(result.body.data.user.id);
  return result;
}
async function order(key = randomUUID()) {
  const result = await agent.post('/api/payments/orders').send({ planId: String(plan._id), key }).expect(201);
  return result.body.data.order;
}
function initiate(current) { return agent.post(`/api/payments/orders/${current.id}/pay`).send(billing); }
async function verify(current) {
  await PaymentOrder.updateOne({ _id: current.id }, { $set: { nextVerifyAt: new Date(0) } });
  return agent.post(`/api/payments/orders/${current.id}/verify`).send({});
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
  await Promise.all([User.init(), Admin.init(), Plan.init(), Setting.init(), Feature.init(), AccessSubscription.init(), PaymentOrder.init(), AdvertisingConsent.init(), AnalyticsEvent.init(), AnalyticsSession.init(), AnalyticsVisitor.init()]);
});
afterAll(async () => { Object.assign(env, originalEnv); await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  Object.assign(env, originalEnv, { CLIENT_URL: 'https://orbit.test', SLICKPAY_ENABLED: true, SLICKPAY_ENV: 'sandbox', SLICKPAY_API_KEY: 'test-only-not-live', SLICKPAY_RETURN_URL: 'https://orbit.test/checkout/return', META_CAPI_ENABLED: false });
  admin = await Admin.create({ fullName: 'Admin', email: 'admin@example.com', passwordHash: 'unused', role: 'SUPER_ADMIN' });
  const feature = await Feature.create({ key: 'tasks', name: 'Tasks', category: 'Workspace', icon: 'solar:check-circle-bold', type: 'LIMIT' });
  plan = await Plan.create({ name: 'Orbit month', slug: 'orbit-month', durationValue: 1, durationUnit: 'MONTH', price: { amount: 2500, currency: 'DZD' }, public: { visible: true }, features: [{ feature: feature._id, enabled: true, limit: 50 }], createdBy: admin._id });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('registration and entitlement isolation', () => {
  it('registers with only essentials, keeps attribution/session, and grants no paid access', async () => {
    const result = await register();
    expect(result.body.data.access.eligible).toBe(false);
    expect(result.body.data.conversion.eventId).toBe(`registration:${user._id}`);
    expect(await Setting.countDocuments({ user: user._id })).toBe(1);
    expect(await AccessSubscription.countDocuments()).toBe(0);
    expect(await AnalyticsSession.countDocuments()).toBe(1);
    const event = await AnalyticsEvent.findOne({ name: 'registration_completed' });
    expect(event.attribution.firstTouch.utmCampaign).toBe('launch');
    await agent.get('/api/tasks').expect(403);
    await agent.get('/api/payments/orders').expect(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects duplicate/invalid registration and allows existing login without another conversion', async () => {
    await request(app).post('/api/auth/register').send({ ...signup, password: 'short' }).expect(422);
    await register();
    await request(app).post('/api/auth/register').send({ ...signup, email: 'CUSTOMER@example.com' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: signup.email, password: signup.password }).expect(200);
    expect(await User.countDocuments()).toBe(1);
    expect(await AnalyticsEvent.countDocuments({ name: 'registration_completed' })).toBe(1);
  });
  it('preserves link registration and activation without reporting Purchase', async () => {
    const link = await createActivationLink(plan._id, admin._id);
    const key = link.url.split('/').pop();
    const customer = request.agent(app);
    await customer.post(`/api/activation/${key}/register`).send({ ...signup, gender: 'FEMALE' }).expect(201);
    expect(await AccessSubscription.countDocuments()).toBe(0);
    await customer.post(`/api/activation/${key}/activate`).expect(200);
    expect((await AccessSubscription.findOne()).source).toBe('ACTIVATION_LINK');
    expect(await AnalyticsEvent.countDocuments({ name: 'registration_completed' })).toBe(1);
    expect(await AnalyticsEvent.countDocuments({ name: 'payment_confirmed' })).toBe(0);
  });
  it('keeps visitor and consent ownership unchanged when link registration fails', async () => {
    await register();
    const link = await createActivationLink(plan._id, admin._id);
    const anonymous = request.agent(app);
    await anonymous.post('/api/analytics/session').send({ landingUrl: 'https://orbit.test/?utm_source=meta', entry: true }).expect(200);
    await anonymous.post('/api/analytics/advertising-consent').send({ granted: true }).expect(200);
    const before = await AnalyticsVisitor.findOne({ user: null });
    await anonymous.post(`/api/activation/${link.url.split('/').pop()}/register`).send({ ...signup, gender: 'FEMALE' }).expect(409);
    expect((await AnalyticsVisitor.findById(before._id)).user).toBeUndefined();
    expect((await AdvertisingConsent.findOne()).user).toBeUndefined();
    expect(await User.countDocuments()).toBe(1);
    expect(await AnalyticsEvent.countDocuments({ name: 'registration_completed' })).toBe(1);
  });
});
describe('SlickPay lifecycle and recovery', () => {
  it('creates a documented invoice with server price; concurrent repeated calls create one invoice', async () => {
    await register();
    const key = randomUUID();
    const [first, second] = await Promise.all([order(key), order(key)]);
    expect(first.id).toBe(second.id);
    expect(await PaymentOrder.countDocuments()).toBe(1);
    fetch.mockResolvedValue(response(invoice()));
    const calls = await Promise.all([initiate(first), initiate(first)]);
    expect(calls.some((v) => v.status === 200)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://devapi.slick-pay.com/api/v2/users/invoices');
    expect(JSON.parse(options.body)).toMatchObject({ amount: 2500, email: signup.email, ...billing, items: [{ name: plan.name, price: 2500, quantity: 1 }] });
    expect(JSON.parse(options.body).url).toBe(`https://orbit.test/checkout/return?order=${first.id}`);
    await agent.post('/api/payments/orders').send({ planId: String(plan._id), key: randomUUID(), amount: 1 }).expect(422);
    await initiate(first).expect(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('verifies payment, grants exactly once with concurrent checks and preserves attribution', async () => {
    await register({ ads: true }); const current = await order();
    fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockResolvedValue(response(paid()));
    await PaymentOrder.updateOne({ _id: current.id }, { $set: { nextVerifyAt: new Date(0) } });
    await Promise.all([agent.post(`/api/payments/orders/${current.id}/verify`).send({}), agent.post(`/api/payments/orders/${current.id}/verify`).send({})]);
    const result = await verify(current);
    expect(result.body.data.state).toBe('PAID');
    expect(result.body.data.conversion).toMatchObject({ name: 'Purchase', eventId: `purchase:${current.id}`, data: { value: 2500, currency: 'DZD' } });
    expect(await AccessSubscription.countDocuments({ order: current.id })).toBe(1);
    const grant = await AccessSubscription.findOne();
    expect(grant.activationLink).toBeUndefined(); expect(grant.source).toBe('SLICKPAY');
    expect(grant.planSnapshot.features[0].limit).toBe(50);
    const event = await AnalyticsEvent.findOne({ eventId: `purchase:${current.id}` }).select('+metaDelivery');
    expect(event.attribution.firstTouch.utmCampaign).toBe('launch');
    expect(JSON.parse(decryptSecret(event.metaDelivery.payload)).event_id).toBe(result.body.data.conversion.eventId);
    expect(await AnalyticsEvent.countDocuments({ name: 'payment_confirmed' })).toBe(1);
    await agent.get('/api/tasks').expect(200);
    expect(JSON.stringify(result.body)).not.toMatch(/metaDelivery|advertising|user_data|authTag|passwordHash/);
  });
  it('extends existing valid access without shortening it and preserves the purchased snapshot', async () => {
    await register();
    const expiry = new Date('2030-01-31T12:00:00Z');
    await AccessSubscription.create({ user: user._id, plan: plan._id, activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: expiry });
    const current = await order(); fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    await Plan.updateOne({ _id: plan._id }, { $set: { durationValue: 2, status: 'INACTIVE' } });
    fetch.mockResolvedValue(response(paid())); await verify(current);
    const grant = await AccessSubscription.findOne({ order: current.id });
    expect(grant.startedAt.toISOString()).toBe(expiry.toISOString());
    expect(grant.expiresAt.toISOString()).toBe('2030-02-28T12:00:00.000Z');
    expect(await AccessSubscription.countDocuments()).toBe(2);
  });
  it('does not activate pending payments or believe return query parameters', async () => {
    await register(); const current = await order();
    fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockResolvedValue(response({ success: 1, data: { completed: 0 } }));
    const result = await verify(current);
    expect(result.body.data.state).toBe('PROCESSING');
    await agent.get(`/api/payments/orders/${current.id}?success=true&paid=true`).expect(200);
    await agent.post(`/api/payments/orders/${current.id}/verify`).send({ paid: true }).expect(422);
    await request(app).post('/api/payments/webhook').send({ id: 123, status: 'paid' }).expect(501);
    expect(await AccessSubscription.countDocuments()).toBe(0);
  });
  it('retains an ambiguous invoice POST and prevents a second charge after timeout', async () => {
    await register(); const current = await order();
    fetch.mockRejectedValue(new Error('timeout'));
    await initiate(current).expect(409);
    await initiate(current).expect(409);
    expect((await order()).id).toBe(current.id);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await PaymentOrder.findById(current.id)).reviewCode).toBe('INVOICE_UNCERTAIN');
    expect(await AccessSubscription.countDocuments()).toBe(0);
  });
  it('records a definite invoice rejection as FAILED without access, allowing correction', async () => {
    await register(); const current = await order(); fetch.mockResolvedValue(response({}, 422));
    await initiate(current).expect(409);
    expect((await PaymentOrder.findById(current.id)).state).toBe('FAILED');
    expect(await AnalyticsEvent.countDocuments({ name: 'payment_failed' })).toBe(1);
    expect((await order()).id).not.toBe(current.id);
    expect(await AccessSubscription.countDocuments()).toBe(0);
  });
  it.each([['amount', paid(1), 'PAYMENT_AMOUNT_MISMATCH'], ['currency', { success: 1, data: { ...paid().data, currency: 'USD' } }, 'PAYMENT_CURRENCY_MISMATCH'], ['invoice', { success: 1, data: { ...paid().data, id: 999 } }, 'PAYMENT_INVOICE_MISMATCH'], ['malformed', { success: 1, data: 'unknown' }, 'PROVIDER_CONTRACT']])('refuses %s mismatch or malformed provider data', async (_label, providerResult, code) => {
    await register(); const current = await order(); fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockResolvedValue(response(providerResult)); const result = await verify(current);
    expect(result.body.data.reviewCode).toBe(code); expect(result.body.data.state).toBe('PROCESSING');
    expect(await AccessSubscription.countDocuments()).toBe(0);
  });
  it('keeps GET timeout pending and recovers later', async () => {
    await register(); const current = await order(); fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockRejectedValue(new Error('timeout')); expect((await verify(current)).body.data.state).toBe('PROCESSING');
    fetch.mockResolvedValue(response(paid())); expect((await verify(current)).body.data.state).toBe('PAID');
  });
  it('rejects unauthenticated/foreign orders, disabled/invalid plans, stale quotes, and unsafe redirects', async () => {
    await register(); const current = await order();
    await request(app).get(`/api/payments/orders/${current.id}`).expect(401);
    const foreign = await User.create({ fullName: 'Other', email: 'other@example.com', passwordHash: 'unused' });
    const cookie = `orbit_user=${jwt.sign({ sub: String(foreign._id), type: 'user' }, env.AUTH_JWT_SECRET, { issuer: 'orbit' })}`;
    await request(app).post(`/api/payments/orders/${current.id}/verify`).set('Cookie', cookie).send({}).expect(404);
    await PaymentOrder.updateOne({ _id: current.id }, { $set: { quoteExpiresAt: new Date(0) } });
    await initiate(current).expect(409); expect((await PaymentOrder.findById(current.id)).state).toBe('EXPIRED');
    await Plan.updateOne({ _id: plan._id }, { $set: { status: 'INACTIVE' } });
    await agent.post('/api/payments/orders').send({ planId: String(plan._id), key: randomUUID() }).expect(409);
    env.SLICKPAY_RETURN_URL = 'https://evil.example/checkout/return';
    await agent.post('/api/payments/orders').send({ planId: String(plan._id), key: randomUUID() }).expect(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects replay of an already used provider reference across orders', async () => {
    await register(); let current = await order(); fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockResolvedValue(response(paid())); await verify(current);
    current = await order(); fetch.mockResolvedValueOnce(response(invoice(456))); await initiate(current).expect(200);
    fetch.mockResolvedValue(response(paid())); await verify(current);
    expect((await PaymentOrder.findById(current.id)).state).toBe('PROCESSING');
    expect(await AccessSubscription.countDocuments()).toBe(1);
  });
  it('resumes an existing invoice without submitting billing again and can cancel only an unsent order', async () => {
    await register(); let current = await order();
    await agent.post(`/api/payments/orders/${current.id}/cancel`).send({}).expect(200);
    expect((await PaymentOrder.findById(current.id)).state).toBe('CANCELLED');
    current = await order(); fetch.mockResolvedValue(response(invoice())); await initiate(current).expect(200);
    await agent.post(`/api/payments/orders/${current.id}/pay`).send({}).expect(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    await agent.post(`/api/payments/orders/${current.id}/cancel`).send({}).expect(200);
    expect((await PaymentOrder.findById(current.id)).state).toBe('PROCESSING');
  });
  it.each([{ price: { amount: 0, currency: 'DZD' } }, { price: { amount: 10, currency: 'USD' } }, { public: { visible: false } }])('refuses non-purchasable configured plans: %j', async (change) => {
    await register(); await Plan.updateOne({ _id: plan._id }, { $set: change });
    await agent.post('/api/payments/orders').send({ planId: String(plan._id), key: randomUUID() }).expect(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('protects the payment admin view and never exposes matching data or credentials', async () => {
    await register({ ads: true }); await order();
    await agent.get('/api/admin/payments').expect(401);
    const cookie = `orbit_admin=${jwt.sign({ sub: String(admin._id), type: 'admin' }, env.AUTH_JWT_SECRET, { issuer: 'orbit' })}`;
    const result = await request(app).get('/api/admin/payments').set('Cookie', cookie).expect(200);
    expect(result.body.data.rows[0]).toMatchObject({ amount: 2500, state: 'PENDING' });
    expect(JSON.stringify(result.body)).not.toMatch(/user_data|advertising|encrypted|passwordHash|test-only-not-live/);
  });
  it('requires production validation, and never grants sandbox access on a production server', () => {
    env.NODE_ENV = 'production'; expect(paymentsAvailable()).toBe(false);
    env.SLICKPAY_ENV = 'production'; expect(paymentsAvailable()).toBe(false);
    env.SLICKPAY_CONTRACT_VERIFIED = true; expect(paymentsAvailable()).toBe(true);
  });
  it('does not infer success from incomplete documented status or an arbitrary status label', () => {
    const fakeOrder = { amountMinor: 250000, currency: 'DZD', invoiceId: '123' };
    expect(() => verifyInvoiceResponse({ success: 1, completed: 1, data: { payment_status: 'paid' } }, fakeOrder)).toThrow();
    expect(() => verifyInvoiceResponse({ success: 1, data: { completed: 1, status: 'paid' } }, fakeOrder)).toThrow();
  });
});
describe('Meta durable delivery and consent', () => {
  it('normalizes hashes and preserves un-hashed network/click data without inventing phone country', () => {
    expect(matchingData({ email: ' TEST@Example.COM ', phone: '+213 555-123-456', externalId: 'user-1', ip: '127.0.0.1', userAgent: 'Browser', fbp: 'fb.1.1780000000000.123', fbc: 'fb.1.1780000000000.click' })).toEqual({ em: [sha256('test@example.com')], ph: [sha256('213555123456')], external_id: [sha256('user-1')], client_ip_address: '127.0.0.1', client_user_agent: 'Browser', fbp: 'fb.1.1780000000000.123', fbc: 'fb.1.1780000000000.click' });
    expect(matchingData({ phone: '0555123456', fbp: 'fake' })).toEqual({});
  });
  it('does not send or queue advertising after consent refusal, even when first-party analytics is enabled', async () => {
    await register(); await order(); await deliverMeta();
    expect(await AnalyticsEvent.countDocuments({ 'metaDelivery.state': { $exists: true } })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('queues atomically but disabled CAPI makes no external calls; retries share exact names/IDs', async () => {
    await register({ ads: true }); await deliverMeta(`registration:${user._id}`); expect(fetch).not.toHaveBeenCalled();
    env.META_CAPI_ENABLED = true; env.META_CAPI_ACCESS_TOKEN = 'rotated-test-token';
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await deliverMeta(`registration:${user._id}`)).toBe('PENDING');
    await AnalyticsEvent.updateOne({ eventId: `registration:${user._id}` }, { $set: { 'metaDelivery.nextAttemptAt': new Date(0) } });
    fetch.mockResolvedValue(response({ events_received: 1 }));
    expect(await deliverMeta(`registration:${user._id}`)).toBe('SENT');
    const events = fetch.mock.calls.map(([, options]) => JSON.parse(options.body).data[0]);
    expect(events[0]).toEqual(events[1]);
    expect(events[0]).toMatchObject({ event_name: 'CompleteRegistration', event_id: `registration:${user._id}`, action_source: 'website', event_source_url: 'https://orbit.test/register' });
    expect(events[0].user_data.em).toEqual([sha256(signup.email)]);
    expect(await deliverMeta(`registration:${user._id}`)).toBeUndefined();
    expect((await AnalyticsEvent.findOne().lean()).metaDelivery).toBeUndefined();
  });
  it('withdrawal cancels queued events and prevents future delivery', async () => {
    await register({ ads: true }); await order();
    await agent.post('/api/analytics/advertising-consent').send({ granted: false }).expect(200);
    env.META_CAPI_ENABLED = true; env.META_CAPI_ACCESS_TOKEN = 'test'; await deliverMeta();
    expect(fetch).not.toHaveBeenCalled();
    const rows = await AnalyticsEvent.find({ 'metaDelivery.state': 'CANCELLED' }).select('+metaDelivery');
    expect(rows).toHaveLength(2); expect(rows[0].metaDelivery.payload?.encrypted).toBeUndefined();
  });
  it('Meta outages cannot block verified purchases and retries are bounded', async () => {
    await register({ ads: true }); const current = await order(); fetch.mockResolvedValueOnce(response(invoice())); await initiate(current).expect(200);
    fetch.mockResolvedValueOnce(response(paid())); await verify(current);
    env.META_CAPI_ENABLED = true; env.META_CAPI_ACCESS_TOKEN = 'test'; fetch.mockRejectedValue(new Error('outage'));
    for (let i = 0; i < 8; i += 1) { await AnalyticsEvent.updateOne({ eventId: `purchase:${current.id}` }, { $set: { 'metaDelivery.nextAttemptAt': new Date(0) } }); await deliverMeta(`purchase:${current.id}`); }
    expect((await AnalyticsEvent.findOne({ eventId: `purchase:${current.id}` }).select('+metaDelivery')).metaDelivery.state).toBe('DEAD');
    expect((await PaymentOrder.findById(current.id)).state).toBe('PAID');
    await agent.get('/api/tasks').expect(200);
  });
});
it('migrates legacy indexes idempotently without changing subscriptions', async () => {
  const legacy = await AccessSubscription.collection.insertOne({ user: new mongoose.Types.ObjectId(), plan: plan._id, activationLink: new mongoose.Types.ObjectId(), startedAt: new Date(), activatedAt: new Date(), expiresAt: new Date('2030-01-01'), status: 'ACTIVE' });
  await AccessSubscription.collection.createIndex({ activationLink: 1 }, { name: 'activationLink_1', unique: true });
  await migrateCommerce(); await migrateCommerce();
  const row = await AccessSubscription.findById(legacy.insertedId);
  expect(row.expiresAt.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  expect(row.source).toBe('ACTIVATION_LINK');
  expect((await AccessSubscription.collection.indexes()).some((index) => index.name === 'activationLink_1')).toBe(false);
});
