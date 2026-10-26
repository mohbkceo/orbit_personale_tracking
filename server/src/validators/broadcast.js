import { z } from 'zod';
import { renderBroadcastText, safeHttpsUrl } from '../services/broadcastContent.js';

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const date = z.iso.datetime({ offset: true });
export const audienceFilters = z.strictObject({
  status: z.enum(['ALL', 'ACTIVE', 'SUSPENDED']).default('ALL'),
  registeredFrom: date.optional(), registeredTo: date.optional(), lastLoginFrom: date.optional(), lastLoginTo: date.optional(),
  subscription: z.enum(['ALL', 'FREE', 'PAID', 'ACTIVE', 'EXPIRED', 'EXPIRING', 'NO_PAID']).default('ALL'),
  planIds: z.array(id).max(30).default([]), expiringDays: z.number().int().min(1).max(365).default(30),
  telegram: z.enum(['ALL', 'CONNECTED', 'NOT_CONNECTED']).default('ALL'),
  interactionFrom: date.optional(), interactionTo: date.optional(), search: z.string().trim().max(100).default(''),
});
export const audienceSelection = z.strictObject({ filters: audienceFilters, allMatching: z.boolean().default(true), includeIds: z.array(id).max(4000).default([]), excludeIds: z.array(id).max(4000).default([]) }).refine((value) => value.allMatching || value.includeIds.length > 0, 'Select at least one user');
const variant = z.strictObject({ text: z.string().trim().min(1).max(6000) });
const button = z.strictObject({ label: z.string().trim().min(1).max(64), url: z.string().optional(), action: z.enum(['ACK', 'PROMO_OPTOUT']).optional() }).refine((value) => Boolean(value.url) !== Boolean(value.action) && (!value.url || Boolean(safeHttpsUrl(value.url))), 'Use one HTTPS URL or allowlisted action');
export const campaignInput = z.strictObject({
  name: z.string().trim().min(1).max(120), description: z.string().max(500).default(''),
  category: z.enum(['ANNOUNCEMENT', 'PRODUCT_UPDATE', 'PROMOTION', 'IMPORTANT_NOTICE', 'CUSTOM']),
  channel: z.literal('telegram').default('telegram'), variants: z.strictObject({ en: variant, ar: variant }),
  imageId: id.nullable().default(null), buttons: z.array(z.array(button).min(1).max(4)).max(8).default([]), audience: audienceSelection,
}).superRefine((value, context) => {
  for (const language of ['en', 'ar']) try { renderBroadcastText(value.variants[language].text); } catch (error) { context.addIssue({ code: 'custom', path: ['variants', language, 'text'], message: error.message }); }
});
export const scheduleInput = z.strictObject({ scheduledAt: date.optional(), adminPassword: z.string().min(1).max(200), confirmation: z.literal('SEND') });
export const testInput = z.strictObject({ recipientUserId: id, language: z.enum(['en', 'ar']).default('en') });
export const settingsInput = z.strictObject({
  enabled: z.boolean(), requestsPerSecond: z.number().int().min(1).max(20), concurrency: z.number().int().min(1).max(10), batchSize: z.number().int().min(1).max(100), maxAttempts: z.number().int().min(1).max(10), retryDelaySeconds: z.number().int().min(10).max(3600), dailyCampaignLimit: z.number().int().min(1).max(100), deliveryStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), deliveryEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), quietHours: z.boolean(), duplicateWindowHours: z.number().int().min(0).max(720),
}).refine((value) => value.deliveryStart !== value.deliveryEnd, 'Delivery hours must differ');
export const pageInput = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25) });
