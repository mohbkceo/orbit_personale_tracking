import { z } from 'zod';
import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';
import { AppError } from '../utils/AppError.js';

export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
export const iconSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const optionalIcon = z.union([iconSchema, z.literal('')]);
const priceSchema = z.object({
  amount: z.coerce.number().finite().min(0),
  originalAmount: z.coerce.number().finite().min(0).nullable(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  suffix: z.string().trim().max(40),
}).strict();
const appearanceSchema = z.object({
  icon: optionalIcon, color: colorSchema, textColor: colorSchema,
  badge: z.string().trim().max(60), highlighted: z.boolean(),
}).strict();
const publicSchema = z.object({
  visible: z.boolean(), order: z.coerce.number().int().min(0),
  ctaText: z.string().trim().min(1).max(80), shortDescription: z.string().trim().max(240),
}).strict();
const entrySchema = z.object({
  feature: z.string().regex(/^[a-f\d]{24}$/i), enabled: z.boolean(),
  limit: z.coerce.number().finite().int().min(0).nullable().optional(),
  value: z.string().trim().max(240).optional(),
}).strict();

export const planInput = z.object({
  name: z.string().trim().min(1).max(100), slug: slugSchema.optional(),
  description: z.string().trim().max(500).optional(),
  durationValue: z.coerce.number().int().min(1).max(10000),
  durationUnit: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR']),
  price: priceSchema.partial().optional(), appearance: appearanceSchema.partial().optional(),
  public: publicSchema.partial().optional(), features: z.array(entrySchema).max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export const featureInput = z.object({
  key: slugSchema, name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(1).max(80), icon: iconSchema,
  type: z.enum(['BOOLEAN', 'LIMIT', 'UNLIMITED', 'TEXT']),
  publicVisible: z.boolean().optional(), order: z.coerce.number().int().min(0).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
}).strict();

export async function validateEntitlements(entries) {
  if (entries === undefined) return;
  const ids = entries.map((entry) => entry.feature);
  if (new Set(ids).size !== ids.length) throw new AppError('A feature can appear only once in a plan', 422);
  const features = await Feature.find({ _id: { $in: ids } }).select('_id type');
  const byId = new Map(features.map((feature) => [String(feature._id), feature]));
  for (const entry of entries) {
    const feature = byId.get(entry.feature);
    if (!feature) throw new AppError('Feature not found in catalog', 422);
    if (feature.type === 'LIMIT' && entry.enabled && (entry.limit === undefined || entry.limit === null)) throw new AppError('LIMIT features require a numeric limit', 422);
    if (feature.type === 'TEXT' && entry.enabled && !entry.value) throw new AppError('TEXT features require a value', 422);
    if (feature.type !== 'LIMIT' && entry.limit != null) throw new AppError('Only LIMIT features accept a limit', 422);
    if (feature.type !== 'TEXT' && entry.value) throw new AppError('Only TEXT features accept a value', 422);
  }
}

export async function publicPlans() {
  const plans = await Plan.find({ status: 'ACTIVE', 'public.visible': true })
    .select('name slug description durationValue durationUnit price appearance public features')
    .sort({ 'public.order': 1, _id: 1 })
    .populate({ path: 'features.feature', match: { status: 'ACTIVE', publicVisible: true }, select: 'key name description category icon type order' })
    .lean();
  return plans.map((plan) => ({
    id: String(plan._id), name: plan.name, slug: plan.slug,
    durationValue: plan.durationValue, durationUnit: plan.durationUnit,
    price: plan.price, appearance: plan.appearance, public: plan.public,
    features: (plan.features || []).filter((entry) => entry.enabled && entry.feature)
      .sort((a, b) => a.feature.order - b.feature.order || a.feature.name.localeCompare(b.feature.name))
      .map((entry) => ({
        key: entry.feature.key, name: entry.feature.name, description: entry.feature.description,
        category: entry.feature.category, icon: entry.feature.icon, type: entry.feature.type,
        ...(entry.feature.type === 'LIMIT' ? { limit: entry.limit } : {}),
        ...(entry.feature.type === 'TEXT' ? { value: entry.value } : {}),
      })),
  }));
}
