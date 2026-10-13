import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { startJobs } from './jobs/scheduler.js';
import { TelegramSession } from './models/TelegramSession.js';
import { TaskDigestDelivery } from './models/TaskDigestDelivery.js';
import { DzEvent } from './models/DzEvent.js';
import { EventSubscription } from './models/EventSubscription.js';
import { EventDiscoveryDelivery } from './models/EventDiscoveryDelivery.js';
import { startCommerceJobs } from './jobs/commerce.js';
import { AccessSubscription } from './models/AccessSubscription.js';
import { PaymentOrder } from './models/PaymentOrder.js';
import { AnalyticsEvent } from './models/AnalyticsEvent.js';
import { AdvertisingConsent } from './models/AdvertisingConsent.js';

await connectDatabase();
await Promise.all([PaymentOrder.createIndexes(), AnalyticsEvent.createIndexes(), AdvertisingConsent.createIndexes()]);
if (env.SLICKPAY_ENABLED) {
  const indexes = await AccessSubscription.collection.indexes();
  if (!indexes.some((index) => index.name === 'activationLink_partial_unique') || indexes.some((index) => index.key.activationLink === 1 && index.unique && !index.partialFilterExpression)) throw new Error('Run npm run migrate:commerce -w server before enabling SlickPay.');
}
await TelegramSession.createIndexes();
await TaskDigestDelivery.createIndexes();
await Promise.all([DzEvent.createIndexes(), EventSubscription.createIndexes(), EventDiscoveryDelivery.createIndexes()]);
const server = app.listen(env.PORT, () => {
  console.log(`Orbit API listening on http://localhost:${env.PORT}`);
  if (env.NODE_ENV !== 'test') startJobs();
});
const stopCommerce = env.NODE_ENV !== 'test' ? startCommerceJobs() : () => {};

async function shutdown(signal) {
  stopCommerce();
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await disconnectDatabase(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
