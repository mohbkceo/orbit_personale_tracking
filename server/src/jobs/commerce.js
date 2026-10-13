import { env } from '../config/env.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { deliverMeta, metaProvider } from '../analytics/metaProvider.js';
import { registerConversionProvider } from '../analytics/conversionDispatcher.js';
import { verifyOrder } from '../services/paymentService.js';

let running = false;
export async function runCommerceJobs() {
  if (running) return;
  running = true;
  try {
    // Bounded work, leases across processes, and no invoice creation in background.
    if (env.META_CAPI_ENABLED) for (let i = 0; i < 10; i += 1) { if (!await deliverMeta()) break; }
    await AnalyticsEvent.updateMany({ 'metaDelivery.state': { $in: ['PENDING', 'SENDING', 'DEAD'] }, occurredAt: { $lt: new Date(Date.now() - 6 * 86400000) } }, { $set: { 'metaDelivery.state': 'DEAD', 'metaDelivery.lastCode': 'EVENT_TOO_OLD' }, $unset: { 'metaDelivery.payload': 1 } });
    await PaymentOrder.updateMany({ state: 'PENDING', quoteExpiresAt: { $lt: new Date() } }, { $set: { state: 'EXPIRED' }, $unset: { openKey: 1, advertising: 1 } });
    await PaymentOrder.updateMany({ state: 'PROCESSING', invoiceId: { $exists: false }, creationStartedAt: { $lt: new Date(Date.now() - 60000) } }, { $set: { reviewCode: 'INVOICE_UNCERTAIN' } });
    await PaymentOrder.updateMany({ createdAt: { $lt: new Date(Date.now() - 6 * 86400000) } }, { $unset: { advertising: 1 } });
    if (env.SLICKPAY_ENABLED) {
      const orders = await PaymentOrder.find({ state: 'PROCESSING', invoiceId: { $exists: true }, environment: env.SLICKPAY_ENV, verifyAttempts: { $lt: 48 }, nextVerifyAt: { $lte: new Date() } }).sort({ nextVerifyAt: 1 }).limit(5);
      for (const order of orders) await verifyOrder(order);
    }
  } catch { console.warn('commerce_worker_deferred'); }
  finally { running = false; }
}
export function startCommerceJobs() {
  registerConversionProvider(metaProvider);
  const timer = setInterval(() => { void runCommerceJobs(); }, 15000);
  timer.unref();
  void runCommerceJobs();
  return () => clearInterval(timer);
}
