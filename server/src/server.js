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
import { ensureAccessCatalog } from './services/accessCatalogSeed.js';
import { startBroadcastWorker } from './jobs/broadcastWorker.js';
import { ensureAutomaticTemplates } from './services/automaticMessages.js';
import { BroadcastCampaign } from './models/BroadcastCampaign.js';
import { BroadcastRecipient } from './models/BroadcastRecipient.js';
import { BroadcastSettings } from './models/BroadcastSettings.js';
import { BroadcastWorkerSlot } from './models/BroadcastWorkerSlot.js';
import { BroadcastLaunchGuard } from './models/BroadcastLaunchGuard.js';
import { BroadcastDailyQuota } from './models/BroadcastDailyQuota.js';
import { BroadcastSegment } from './models/BroadcastSegment.js';
import { BroadcastInteraction } from './models/BroadcastInteraction.js';
import { MessagePreference } from './models/MessagePreference.js';
import { AutomaticMessageTemplate } from './models/AutomaticMessageTemplate.js';
import { AutomaticMessageRevision } from './models/AutomaticMessageRevision.js';
import { User } from './models/User.js';
import { TelegramConnection } from './models/TelegramConnection.js';

await connectDatabase();
await ensureAccessCatalog();
await Promise.all([User.createIndexes(), TelegramConnection.createIndexes(), BroadcastCampaign.createIndexes(), BroadcastRecipient.createIndexes(), BroadcastSettings.createIndexes(), BroadcastWorkerSlot.createIndexes(), BroadcastLaunchGuard.createIndexes(), BroadcastDailyQuota.createIndexes(), BroadcastSegment.createIndexes(), BroadcastInteraction.createIndexes(), MessagePreference.createIndexes(), AutomaticMessageTemplate.createIndexes(), AutomaticMessageRevision.createIndexes()]);
await ensureAutomaticTemplates();
await Promise.all([PaymentOrder.createIndexes(), AnalyticsEvent.createIndexes(), AdvertisingConsent.createIndexes()]);
if (env.SLICKPAY_ENABLED) {
  const indexes = await AccessSubscription.collection.indexes();
  if (!indexes.some((index) => index.name === 'activationLink_partial_unique') || indexes.some((index) => index.key.activationLink === 1 && index.unique && !index.partialFilterExpression)) throw new Error('Run npm run migrate:commerce -w server before enabling SlickPay.');
}
await AccessSubscription.createIndexes();
await TelegramSession.createIndexes();
await TaskDigestDelivery.createIndexes();
await Promise.all([DzEvent.createIndexes(), EventSubscription.createIndexes(), EventDiscoveryDelivery.createIndexes()]);
const server = app.listen(env.PORT, () => {
  console.log(`Orbit API listening on http://localhost:${env.PORT}`);
  if (env.NODE_ENV !== 'test') startJobs();
});
const stopCommerce = env.NODE_ENV !== 'test' ? startCommerceJobs() : () => {};
const stopBroadcast = env.NODE_ENV !== 'test' && env.BROADCAST_WORKER_EMBEDDED ? startBroadcastWorker() : () => {};

async function shutdown(signal) {
  stopCommerce();
  stopBroadcast();
  console.log(`${signal} received, shutting down`);
  server.close(async () => { await disconnectDatabase(); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
