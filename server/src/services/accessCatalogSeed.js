import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';
import { AccessConfiguration } from '../models/AccessConfiguration.js';
import { DEFAULTS, LEGACY_FEATURE_KEYS } from './entitlementCatalog.js';
import { invalidateEntitlementCache } from './entitlementService.js';

export async function ensureAccessCatalog() {
  const firstRollout = !(await AccessConfiguration.exists({ key: 'global' }));
  for (const feature of Object.values(DEFAULTS)) {
    await Feature.updateOne({ key: feature.key }, { $setOnInsert: { ...feature, description: `${feature.name} in Orbit.`, publicVisible: true, status: 'ACTIVE' } }, { upsert: true });
    if (firstRollout && feature.scope === 'SECTION') await Feature.updateOne({ key: feature.key }, { $set: { scope: 'SECTION' } });
  }
  // The workspace entry point is an account operation and cannot be disabled.
  await Feature.updateOne({ key: 'dashboard' }, { $set: { accessMode: 'FREE', status: 'ACTIVE', scope: 'SECTION' } });
  const features = await Feature.find({ key: { $in: Object.keys(DEFAULTS) } }).select('_id key').lean();
  const ids = Object.fromEntries(features.map((feature) => [feature.key, feature._id]));
  await Plan.updateOne({ slug: 'free' }, { $setOnInsert: {
    name: 'Free', slug: 'free', kind: 'FREE', durationUnit: 'PERMANENT', description: 'A permanent workspace for everyday planning.',
    price: { amount: 0, originalAmount: null, currency: 'DZD', suffix: 'forever' },
    public: { visible: true, order: 0, ctaText: 'Start free', shortDescription: 'No payment required.' },
    features: Object.values(DEFAULTS).filter((feature) => feature.accessMode === 'FREE').map((feature) => ({ feature: ids[feature.key], enabled: true })),
    status: 'ACTIVE',
  } }, { upsert: true });
  await Plan.updateOne({ slug: 'free' }, { $set: { name: 'Free', kind: 'FREE', durationUnit: 'PERMANENT', 'price.amount': 0, 'price.originalAmount': null, 'public.visible': true, status: 'ACTIVE' }, $unset: { durationValue: 1 } });
  // Only at first rollout: make new section assignments explicit on legacy plans.
  if (firstRollout) {
    const plans = await Plan.find({ slug: { $ne: 'free' } }).populate('features.feature', 'key');
    for (const plan of plans) {
      const keys = new Set(plan.features.map((entry) => entry.feature?.key).filter(Boolean));
      for (const definition of Object.values(DEFAULTS)) {
        if (keys.has(definition.key)) continue;
        const alias = (LEGACY_FEATURE_KEYS[definition.key] || []).find((key) => keys.has(key));
        const old = alias && plan.features.find((entry) => entry.feature?.key === alias);
        if (old?.enabled || definition.accessMode === 'FREE') plan.features.push({ feature: ids[definition.key], enabled: true, ...(definition.type === 'LIMIT' && old?.limit != null ? { limit: old.limit } : {}) });
      }
      await plan.save();
    }
  }
  // Mark the rollout complete only after every plan was migrated, so a restart
  // can safely resume after an interrupted first run.
  await AccessConfiguration.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { version: 1, seededAt: new Date() } }, { upsert: true, new: true });
  invalidateEntitlementCache();
}
