import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { userAuth, adminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { createOrder, ownedOrder, publicOrder, initiatePayment, verifyOrder } from '../services/paymentService.js';
import { audit } from '../services/auditService.js';
import { metaCustomData } from '../../../shared/metaEvents.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

export const paymentRoutes = Router();
// No webhook authenticity algorithm is published. Reject rather than trusting a callback.
paymentRoutes.post('/webhook', (_req, res) => res.status(501).json({ success: false, code: 'WEBHOOK_UNSUPPORTED', message: 'Use authenticated invoice reconciliation.' }));
paymentRoutes.use(userAuth, rateLimit({ windowMs: 60000, limit: process.env.NODE_ENV === 'test' ? 1000 : 30 }));
paymentRoutes.get('/orders', asyncHandler(async (req, res) => success(res, (await PaymentOrder.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20)).map(publicOrder))));
paymentRoutes.post('/orders', validate(z.strictObject({ planId: z.string().regex(/^[a-f\d]{24}$/i), key: z.uuid() })), asyncHandler(async (req, res) => {
  const order = await createOrder(req.user, req.body.planId, req.body.key, req, res);
  return success(res, { order: publicOrder(order), conversion: { name: 'InitiateCheckout', eventId: `checkout:${order._id}`, data: metaCustomData({ planId: String(order.plan), value: order.amountMinor / 100, currency: order.currency, orderId: String(order._id) }) } }, 201);
}));
paymentRoutes.get('/orders/:id', asyncHandler(async (req, res) => success(res, publicOrder(await ownedOrder(req.params.id, req.user)))));
const billingInput = z.strictObject({
  firstname: z.string().trim().min(1).max(100), lastname: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{8,24}$/), address: z.string().trim().min(5).max(300),
});
paymentRoutes.post('/orders/:id/pay', asyncHandler(async (req, res) => {
  const order = await ownedOrder(req.params.id, req.user);
  const parsed = (order.state === 'PENDING' ? billingInput : z.union([z.strictObject({}), billingInput])).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ success: false, message: 'Enter your first name, last name, phone number and billing address.', errors: parsed.error.flatten().fieldErrors });
  return success(res, await initiatePayment(order, req.user, parsed.data));
}));
paymentRoutes.post('/orders/:id/verify', validate(z.strictObject({})), asyncHandler(async (req, res) => success(res, publicOrder(await verifyOrder(await ownedOrder(req.params.id, req.user))))));
paymentRoutes.post('/orders/:id/cancel', validate(z.strictObject({})), asyncHandler(async (req, res) => {
  const order = await ownedOrder(req.params.id, req.user);
  await PaymentOrder.updateOne({ _id: order._id, state: 'PENDING', creationStartedAt: { $exists: false } }, { $set: { state: 'CANCELLED' }, $unset: { openKey: 1, advertising: 1 } });
  return success(res, publicOrder(await ownedOrder(req.params.id, req.user)));
}));
export const adminPaymentRoutes = Router();
adminPaymentRoutes.use(adminAuth);
adminPaymentRoutes.get('/meta-delivery', asyncHandler(async (_req, res) => {
  const states = await AnalyticsEvent.aggregate([{ $match: { 'metaDelivery.state': { $exists: true } } }, { $group: { _id: '$metaDelivery.state', count: { $sum: 1 } } }]);
  const failed = await AnalyticsEvent.find({ 'metaDelivery.state': 'DEAD' }).select('eventId name occurredAt +metaDelivery').sort({ occurredAt: -1 }).limit(30);
  return success(res, { states: states.map((row) => ({ state: row._id, count: row.count })), failed: failed.map((row) => ({ eventId: row.eventId, name: row.name, occurredAt: row.occurredAt, code: row.metaDelivery.lastCode, retryable: Boolean(row.metaDelivery.payload?.encrypted && Date.now() - row.occurredAt < 6 * 86400000) })) });
}));
adminPaymentRoutes.post('/meta-delivery/:eventId/retry', asyncHandler(async (req, res) => {
  if (!/^(registration|checkout|purchase):[a-f\d]{24}$/i.test(req.params.eventId)) return res.status(422).json({ success: false, message: 'Invalid conversion ID.' });
  const changed = await AnalyticsEvent.updateOne({ eventId: req.params.eventId, 'metaDelivery.state': 'DEAD', 'metaDelivery.payload.encrypted': { $exists: true }, occurredAt: { $gt: new Date(Date.now() - 6 * 86400000) } }, { $set: { 'metaDelivery.state': 'PENDING', 'metaDelivery.attempts': 0, 'metaDelivery.nextAttemptAt': new Date() } });
  await audit('META_DELIVERY_RETRY_REQUESTED', { actorType: 'ADMIN', actorId: req.admin._id, metadata: { eventId: req.params.eventId } });
  return success(res, { queued: changed.modifiedCount === 1 });
}));
adminPaymentRoutes.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const rows = await PaymentOrder.find().sort({ createdAt: -1 }).skip((page - 1) * 30).limit(30);
  return success(res, { rows: rows.map((order) => ({ ...publicOrder(order), userId: String(order.user), environment: order.environment, createdAt: order.createdAt })), page, total: await PaymentOrder.countDocuments() });
}));
adminPaymentRoutes.post('/:id/verify', asyncHandler(async (req, res) => {
  const order = await PaymentOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
  await audit('PAYMENT_RECONCILIATION_REQUESTED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'PaymentOrder', targetId: order._id });
  return success(res, publicOrder(await verifyOrder(order)));
}));
