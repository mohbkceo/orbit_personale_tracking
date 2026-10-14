import mongoose from 'mongoose';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { Plan } from '../models/Plan.js';
import { User } from '../models/User.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { addDuration, currentSubscription } from './accessService.js';
import { audit } from './auditService.js';
import { assertPaymentsAvailable, amountMinor, slickpayProvider } from './slickpayProvider.js';
import { captureConversionContext, recordDurableConversion } from '../analytics/analyticsService.js';
import { EVENTS } from '../analytics/events.js';
import { metaCustomData } from '../../../shared/metaEvents.js';

const properties = (order) => ({ planId: String(order.plan), value: order.amountMinor / 100, currency: order.currency, orderId: String(order._id) });
const orderContext = (order) => order.analytics ? { ...order.analytics, advertising: order.advertising ? JSON.parse(decryptSecret(order.advertising)) : null } : null;
export function publicOrder(order) {
  return { id: String(order._id), planId: String(order.plan), state: order.state, amount: order.amountMinor / 100,
    currency: order.currency, plan: order.planSnapshot, reference: order.paymentReference || null,
    invoiceId: order.invoiceId || null, paidAt: order.paidAt, reviewCode: order.reviewCode || null,
    canPay: order.state === 'PENDING' || (order.state === 'PROCESSING' && Boolean(order.invoiceId)),
    conversion: order.state === 'PAID' && Date.now() - new Date(order.paidAt).getTime() < 24 * 3600000
      ? { name: 'Purchase', eventId: `purchase:${order._id}`, data: metaCustomData(properties(order)) } : null };
}
export async function ownedOrder(id, user) {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Order not found.', 404);
  const order = await PaymentOrder.findOne({ _id: id, user: user._id }).select('+paymentUrl +analytics +advertising');
  if (!order) throw new AppError('Order not found.', 404);
  return order;
}
export async function createOrder(user, planId, key, req, res) {
  assertPaymentsAvailable();
  if (user.status !== 'ACTIVE') throw new AppError('Your Orbit account is suspended.', 403, undefined, 'USER_SUSPENDED');
  const existing = await PaymentOrder.findOne({ user: user._id, $or: [{ key }, { openKey: String(user._id) }] });
  if (existing) {
    if (String(existing.plan) !== planId) throw new AppError('You already have an unfinished order. Resume it before selecting another plan.', 409, { orderId: String(existing._id) }, 'OPEN_ORDER_EXISTS');
    return existing;
  }
  const plan = await Plan.findOne({ _id: planId, status: 'ACTIVE', 'public.visible': true }).populate('features.feature', 'key name type');
  const price = amountMinor(plan?.price?.amount);
  if (!plan || plan.price.currency !== 'DZD' || !price) throw new AppError('This plan is unavailable for online payment.', 409, undefined, 'PLAN_UNAVAILABLE');
  const context = await captureConversionContext(req, res, user);
  const order = new PaymentOrder({ user: user._id, plan: plan._id, key, openKey: String(user._id), amountMinor: price, environment: env.SLICKPAY_ENV,
    quoteExpiresAt: new Date(Date.now() + 30 * 60000),
    planSnapshot: { name: plan.name, durationValue: plan.durationValue, durationUnit: plan.durationUnit,
      features: plan.features.filter((v) => v.feature).map((v) => ({ key: v.feature.key, name: v.feature.name, type: v.feature.type, enabled: v.enabled, limit: v.limit, value: v.value })) },
    ...(context ? { analytics: { visitorId: context.visitorId, sessionId: context.sessionId, attribution: context.attribution },
      ...(context.advertising ? { advertising: encryptSecret(JSON.stringify(context.advertising)) } : {}) } : {}),
  });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PaymentOrder.create([order.toObject()], { session });
      await recordDurableConversion(EVENTS.CHECKOUT_STARTED, `checkout:${order._id}`, user._id, context, properties(order), session);
      await audit('CHECKOUT_STARTED', { actorType: 'USER', actorId: user._id, targetType: 'PaymentOrder', targetId: order._id, session });
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    const winner = await PaymentOrder.findOne({ openKey: String(user._id) });
    if (!winner || String(winner.plan) !== planId) throw new AppError('Another checkout is already open. Resume it from your account.', 409, winner ? { orderId: String(winner._id) } : undefined, 'OPEN_ORDER_EXISTS');
    return winner;
  } finally { await session.endSession(); }
  return order;
}
export async function initiatePayment(order, user, billing) {
  assertPaymentsAvailable();
  if (user.status !== 'ACTIVE') throw new AppError('Your Orbit account is suspended.', 403);
  if (order.environment !== env.SLICKPAY_ENV) throw new AppError('This order belongs to a different payment environment.', 409);
  if (order.state === 'PAID') return { order: publicOrder(order) };
  if (order.state === 'PROCESSING') {
    if (order.invoiceId && order.paymentUrl && !order.reviewCode) return { order: publicOrder(order), paymentUrl: order.paymentUrl };
    throw new AppError('This payment is awaiting verification or support review. Do not submit another payment.', 409, undefined, 'PAYMENT_REVIEW_REQUIRED');
  }
  if (order.state !== 'PENDING') throw new AppError('This order cannot be paid. Return to plans to start again.', 409);
  const plan = await Plan.findOne({ _id: order.plan, status: 'ACTIVE', 'public.visible': true });
  if (order.quoteExpiresAt <= new Date() || !plan || plan.price.currency !== 'DZD' || amountMinor(plan.price.amount) !== order.amountMinor) {
    await PaymentOrder.updateOne({ _id: order._id, state: 'PENDING' }, { $set: { state: 'EXPIRED' }, $unset: { openKey: 1 } });
    throw new AppError('The plan or price changed. Please select your plan again.', 409, undefined, 'QUOTE_EXPIRED');
  }
  const claimed = await PaymentOrder.findOneAndUpdate({ _id: order._id, state: 'PENDING' }, { $set: { state: 'PROCESSING', creationStartedAt: new Date(), reviewCode: 'INVOICE_CREATING' } }, { new: true });
  if (!claimed) throw new AppError('Payment is already being prepared. Resume this order in a moment.', 409, undefined, 'PAYMENT_IN_PROGRESS');
  try {
    // Never automatically retry POST: SlickPay has no documented idempotency contract.
    const invoice = await slickpayProvider.createInvoice(order, billing, user.email);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await PaymentOrder.updateOne({ _id: order._id, state: 'PROCESSING' }, { $set: { ...invoice, nextVerifyAt: new Date(Date.now() + 60000) }, $unset: { reviewCode: 1 } }, { session });
        await recordDurableConversion(EVENTS.PAYMENT_INITIATED, `payment-initiated:${order._id}`, user._id, orderContext(order), properties(order), session);
      });
    } finally { await session.endSession(); }
    return { order: publicOrder(await PaymentOrder.findById(order._id)), paymentUrl: invoice.paymentUrl };
  } catch (error) {
    // A timeout/crash after submission may already have created an invoice. Retain
    // the open order; support must reconcile it before another charge is possible.
    const rejected = error.code === 'INVOICE_REJECTED';
    await PaymentOrder.updateOne({ _id: order._id, state: 'PROCESSING', invoiceId: { $exists: false } }, {
      $set: { reviewCode: rejected ? 'INVOICE_REJECTED' : 'INVOICE_UNCERTAIN', ...(rejected ? { state: 'FAILED' } : {}) },
      ...(rejected ? { $unset: { openKey: 1 } } : {}),
    });
    if (rejected) await recordDurableConversion(EVENTS.PAYMENT_FAILED, `payment-failed:${order._id}`, user._id, orderContext(order), properties(order));
    throw error;
  }
}
export async function confirmPaidOrder(orderId, verification) {
  if (verification.state !== 'PAID') throw new AppError('Payment has not been verified.', 409);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await PaymentOrder.findById(orderId).select('+analytics +advertising').session(session);
      if (order.state === 'PAID') return;
      if (order.state !== 'PROCESSING' || !order.invoiceId || verification.amountMinor !== order.amountMinor || verification.currency !== order.currency || !verification.reference) throw new AppError('Payment verification does not match the order.', 409);
      // Shared with activation links: serializes all entitlement changes for a user.
      const lock = await User.updateOne({ _id: order.user }, { $inc: { accessVersion: 1 } }, { session });
      if (lock.modifiedCount !== 1) throw new AppError('Payment account requires support review.', 409);
      const now = new Date();
      const previous = await currentSubscription(order.user, session);
      const base = previous?.expiresAt > now ? previous.expiresAt : now;
      const expiresAt = addDuration(base, order.planSnapshot.durationValue, order.planSnapshot.durationUnit);
      const [grant] = await AccessSubscription.create([{ user: order.user, plan: order.plan, source: 'SLICKPAY', order: order._id,
        startedAt: base, activatedAt: now, expiresAt, entitlementVersion: 1, planSnapshot: order.planSnapshot }], { session });
      await User.updateOne({ _id: order.user, onboardingCompletedAt: null }, { $set: { onboardingCompletedAt: now } }, { session });
      await PaymentOrder.updateOne({ _id: order._id, state: 'PROCESSING' }, { $set: { state: 'PAID', paidAt: now, paymentReference: verification.reference, subscription: grant._id }, $unset: { openKey: 1, reviewCode: 1, advertising: 1 } }, { session });
      const context = orderContext(order);
      await recordDurableConversion(EVENTS.PAYMENT_CONFIRMED, `purchase:${order._id}`, order.user, context, properties(order), session);
      await recordDurableConversion(EVENTS.PAID_SUBSCRIPTION_ACTIVATED, `paid-access:${order._id}`, order.user, context, { ...properties(order), subscriptionId: String(grant._id) }, session);
      await audit('PAYMENT_CONFIRMED', { targetType: 'PaymentOrder', targetId: order._id, metadata: { subscriptionId: String(grant._id), amount: order.amountMinor / 100, currency: order.currency }, session });
      await audit('ACCESS_ACTIVATED', { targetType: 'AccessSubscription', targetId: grant._id, metadata: { orderId: String(order._id), source: 'SLICKPAY', expiresAt }, session });
    });
  } finally { await session.endSession(); }
  return PaymentOrder.findById(orderId);
}
export async function verifyOrder(order) {
  if (order.state !== 'PROCESSING' || !order.invoiceId) return order;
  if (!env.SLICKPAY_ENABLED || !env.SLICKPAY_API_KEY || order.environment !== env.SLICKPAY_ENV) return order;
  if (env.NODE_ENV === 'production' && (order.environment !== 'production' || !env.SLICKPAY_CONTRACT_VERIFIED)) return order;
  const now = new Date();
  const locked = await PaymentOrder.findOneAndUpdate({ _id: order._id, state: 'PROCESSING', $and: [
    { $or: [{ verifyLeaseUntil: { $exists: false } }, { verifyLeaseUntil: { $lte: now } }] },
    { $or: [{ nextVerifyAt: { $exists: false } }, { nextVerifyAt: { $lte: now } }] },
  ] }, { $set: { verifyLeaseUntil: new Date(Date.now() + 30000) }, $inc: { verifyAttempts: 1 } }, { new: true });
  if (!locked) return PaymentOrder.findById(order._id);
  try {
    const verified = await slickpayProvider.verifyInvoice(locked);
    if (verified.state === 'PAID') return await confirmPaidOrder(locked._id, verified);
    await PaymentOrder.updateOne({ _id: order._id, state: 'PROCESSING' }, { $unset: { reviewCode: 1 } });
  } catch (error) {
    const allowedCodes = ['PROVIDER_UNCERTAIN', 'PROVIDER_CONTRACT', 'PAYMENT_AMOUNT_MISMATCH', 'PAYMENT_CURRENCY_MISMATCH', 'PAYMENT_INVOICE_MISMATCH'];
    const code = allowedCodes.includes(error.code) ? error.code : 'PAYMENT_REVIEW_REQUIRED';
    await PaymentOrder.updateOne({ _id: order._id, state: 'PROCESSING' }, { $set: { reviewCode: code } });
    if (env.NODE_ENV !== 'test') console.warn('payment_verification_deferred', { orderId: String(order._id), code });
  } finally {
    await PaymentOrder.updateOne({ _id: order._id }, { $set: { nextVerifyAt: new Date(Date.now() + Math.min(3600000, 15000 * 2 ** Math.min(locked.verifyAttempts, 8))) }, $unset: { verifyLeaseUntil: 1 } });
  }
  return PaymentOrder.findById(order._id);
}
