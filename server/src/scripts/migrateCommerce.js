import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { PaymentOrder } from '../models/PaymentOrder.js';
import { AdvertisingConsent } from '../models/AdvertisingConsent.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

export async function migrateCommerce() {
  // Build the replacement before dropping the old constraint. No record deletion,
  // expiry adjustment, fake links or wholesale syncIndexes.
  await AccessSubscription.collection.createIndex({ activationLink: 1 }, { name: 'activationLink_partial_unique', unique: true, partialFilterExpression: { activationLink: { $type: 'objectId' } } });
  const indexes = await AccessSubscription.collection.indexes();
  for (const index of indexes) {
    if (Object.keys(index.key).length === 1 && index.key.activationLink === 1 && index.unique && !index.partialFilterExpression) await AccessSubscription.collection.dropIndex(index.name);
  }
  await AccessSubscription.updateMany({ source: { $exists: false }, activationLink: { $type: 'objectId' } }, { $set: { source: 'ACTIVATION_LINK' } });
  await Promise.all([AccessSubscription.createIndexes(), PaymentOrder.createIndexes(), AdvertisingConsent.createIndexes(), AnalyticsEvent.createIndexes()]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await connectDatabase(); await migrateCommerce(); console.log('Commerce indexes and access sources migrated. No subscription dates changed.'); }
  finally { await disconnectDatabase(); }
}
