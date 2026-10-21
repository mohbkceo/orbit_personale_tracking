import { formatNumber } from './format.js';

const builtInPlans = new Set(['free', 'starter', 'plus']);
const planKey = (plan) => builtInPlans.has(plan?.slug) ? plan.slug : builtInPlans.has(plan?.name?.toLowerCase()) ? plan.name.toLowerCase() : null;
const builtInFeatures = new Set(['tasks', 'reminders', 'accounts_transactions', 'income_expenses', 'debts', 'bills_subscriptions', 'goals_savings', 'notes', 'telegram_assistant', 'projects', 'habits', 'wishlist', 'contacts', 'quick_access']);

export const planName = (plan, t) => planKey(plan) ? t(`pricing:plans.${planKey(plan)}.name`) : plan?.name;
export const planDescription = (plan, t) => planKey(plan) ? t(`pricing:plans.${planKey(plan)}.description`) : plan?.public?.shortDescription;
export const planCta = (plan, t) => planKey(plan) ? t(`pricing:plans.${planKey(plan)}.cta`) : plan?.public?.ctaText || t('pricing:getPlan', { plan: plan?.name || t('pricing:ui.plan') });
export const planBadge = (plan, t) => plan?.slug === 'plus' && plan.appearance?.badge === 'Best Value' ? t('pricing:plans.plus.badge') : plan?.appearance?.badge;
export const planSuffix = (plan, t) => planKey(plan) && plan.price?.suffix ? t(`pricing:plans.${planKey(plan)}.suffix`) : plan?.price?.suffix;
export const planFeature = (feature, t) => {
  const name = builtInFeatures.has(feature?.key) ? t(`pricing:features.${feature.key}`) : feature?.name || feature?.key;
  if (feature?.type === 'LIMIT') return `${formatNumber(feature.limit)} ${name}`;
  if (feature?.type === 'UNLIMITED') return t('pricing:unlimitedFeature', { feature: name });
  return feature?.type === 'TEXT' ? feature.value || name : name;
};
export const planDuration = (plan, t) => {
  if (plan?.kind === 'FREE' || plan?.durationUnit === 'PERMANENT' || plan?.slug === 'free') return t('pricing:freeForever');
  if (!plan?.durationValue || !plan?.durationUnit) return '';
  const unit = plan.durationUnit.toLowerCase();
  return t('pricing:durationAccess', { value: formatNumber(plan.durationValue), unit: t(`pricing:units.${unit}`, { count: plan.durationValue }) });
};
