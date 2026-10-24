import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';
import { User } from '../models/User.js';
import { AccessConfiguration } from '../models/AccessConfiguration.js';
import { checkAccess } from './accessService.js';
import { DEFAULTS, LEGACY_FEATURE_KEYS } from './entitlementCatalog.js';
import { AppError } from '../utils/AppError.js';
import { UserFeatureOverride } from '../models/UserFeatureOverride.js';

let catalogCache;
export function invalidateEntitlementCache() { catalogCache = undefined; }
export async function bumpEntitlementVersion() {
  await AccessConfiguration.updateOne({ key: 'global' }, { $inc: { version: 1 } }, { upsert: true });
  invalidateEntitlementCache();
}

async function catalog() {
  if (process.env.NODE_ENV !== 'test' && catalogCache && catalogCache.until > Date.now()) {
    const current = await AccessConfiguration.findOne({ key: 'global' }).select('version').lean();
    if ((current?.version || 1) === catalogCache.value.version) return catalogCache.value;
  }
  const [features, plans, config] = await Promise.all([
    Feature.find().lean(), Plan.find({ status: 'ACTIVE' }).select('name slug kind features status public').lean(),
    AccessConfiguration.findOne({ key: 'global' }).lean(),
  ]);
  const byKey = { ...DEFAULTS };
  for (const feature of features) byKey[feature.key] = feature;
  const value = { byKey, plans, version: config?.version || 1 };
  if (process.env.NODE_ENV !== 'test') catalogCache = { value, until: Date.now() + 15_000 };
  return value;
}

function entriesFor(plan, featureIds) {
  return Object.fromEntries((plan?.features || []).filter((entry) => entry.feature).map((entry) => [featureIds[String(entry.feature)] || String(entry.feature), entry]));
}

function included(entries, key) {
  const direct = entries[key];
  if (direct) return direct;
  return (LEGACY_FEATURE_KEYS[key] || []).map((alias) => entries[alias]).find(Boolean);
}

export async function resolveUserEntitlements(userOrId, { now = new Date(), readOnly = false } = {}) {
  const user = typeof userOrId === 'object' && userOrId.status ? userOrId : await User.findById(userOrId);
  if (!user) throw new AppError('Account not found', 401, undefined, 'UNAUTHENTICATED');
  const [access, data, individualOverrides] = await Promise.all([checkAccess(user, { now, readOnly }), catalog(), UserFeatureOverride.find({ user: user._id }).lean()]);
  const overrideByKey = Object.fromEntries(individualOverrides.map((item) => [item.key, item]));
  const featureIds = Object.fromEntries(Object.values(data.byKey).filter((item) => item._id).map((item) => [String(item._id), item.key]));
  const freePlan = data.plans.find((plan) => plan.kind === 'FREE' || plan.slug === 'free');
  const paidPlan = access.subscription && data.plans.find((plan) => String(plan._id) === String(access.subscription.plan));
  const effectivePlan = access.subscription ? paidPlan || { _id: access.subscription.plan, name: access.subscription.planSnapshot?.name || 'Paid plan', slug: 'paid', kind: 'PAID' } : freePlan || { name: 'Free', slug: 'free', kind: 'FREE' };
  const freeEntries = entriesFor(freePlan, featureIds);
  const paidEntries = access.subscription ? Object.fromEntries([
    ...(access.subscription.planSnapshot?.features || []),
    ...(access.subscription.entitlementOverrides || []),
  ].filter((entry) => entry?.key).map((entry) => [entry.key, entry])) : {};
  const planEntries = entriesFor(paidPlan, featureIds);
  const legacyUnscopedPaid = Boolean(access.subscription && access.subscription.entitlementVersion == null && !access.subscription.planSnapshot?.features?.length);
  const decisions = {};
  for (const [key, feature] of Object.entries(data.byKey)) {
    const recommended = data.plans.find((plan) => plan.kind !== 'FREE' && plan.slug !== 'free' && included(entriesFor(plan, featureIds), key)?.enabled);
    const configuredRecommendation = feature.locked?.recommendedPlan ? data.plans.find((plan) => String(plan._id) === String(feature.locked.recommendedPlan)) : null;
    const presentation = {
      sectionTitle: feature.name, title: feature.locked?.title || `Unlock ${feature.name}`, description: feature.locked?.description || feature.description || '',
      explanation: feature.locked?.explanation || '', presentation: feature.locked?.presentation || 'BLUR',
      ctaLabel: feature.locked?.ctaLabel || 'Explore plans', visibleWhenLocked: feature.locked?.visibleWhenLocked !== false,
      icon: feature.icon, order: feature.order || 0,
      recommendedPlan: configuredRecommendation && included(entriesFor(configuredRecommendation, featureIds), key)?.enabled ? configuredRecommendation : recommended,
    };
    let entry = included(freeEntries, key);
    if (access.subscription) entry = included(paidEntries, key) || included(planEntries, key) || (legacyUnscopedPaid && feature.type !== 'LIMIT' && key !== 'advanced-analytics' ? { enabled: true } : null) || entry;
    if (overrideByKey[key]) entry = overrideByKey[key];
    let allowed = access.eligible && (overrideByKey[key] ? overrideByKey[key].enabled : feature.accessMode === 'FREE' || (feature.accessMode !== 'DISABLED' && feature.status !== 'INACTIVE' && (entry?.enabled ?? false)));
    if (feature.accessMode === 'DISABLED' || feature.status === 'INACTIVE') allowed = false;
    const reason = !access.eligible ? 'ACCOUNT_SUSPENDED' : feature.accessMode === 'DISABLED' || feature.status === 'INACTIVE' ? 'FEATURE_DISABLED' : allowed ? null : 'PLAN_REQUIRED';
    decisions[key] = { allowed, featureKey: key, reason, currentPlan: effectivePlan.slug,
      limit: feature.type === 'LIMIT' && allowed ? (Number.isInteger(entry?.limit) ? entry.limit : null) : null,
      presentation };
  }
  return { effectivePlan: { id: effectivePlan._id ? String(effectivePlan._id) : null, name: effectivePlan.name, slug: effectivePlan.slug, type: access.subscription ? 'PAID' : 'FREE' },
    subscriptionExpiresAt: access.subscription?.expiresAt || null, configurationVersion: data.version,
    decisions, access };
}

export async function canAccess(userOrId, key, options) {
  if (!DEFAULTS[key] && !(await catalog()).byKey[key]) throw new AppError('Unknown entitlement', 500);
  return (await resolveUserEntitlements(userOrId, options)).decisions[key];
}

export function entitlementError(decision) {
  const code = decision.reason === 'ACCOUNT_SUSPENDED' ? 'USER_SUSPENDED' : decision.reason === 'FEATURE_DISABLED' ? 'FEATURE_DISABLED' : 'FEATURE_NOT_INCLUDED';
  const message = code === 'USER_SUSPENDED' ? 'Your Orbit account is suspended.' : code === 'FEATURE_DISABLED' ? 'This feature is temporarily unavailable.' : 'This feature is not included in your current plan.';
  const error = new AppError(message, 403, undefined, code);
  error.feature = decision.featureKey;
  error.upgradePlan = decision.presentation.recommendedPlan?.slug;
  return error;
}

export async function assertFeature(userOrId, key) {
  const decision = await canAccess(userOrId, key);
  if (!decision.allowed) throw entitlementError(decision);
  return decision;
}
