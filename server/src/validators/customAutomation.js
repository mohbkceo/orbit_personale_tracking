import { z } from 'zod';
import { renderBroadcastText, safeHttpsUrl } from '../services/broadcastContent.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
export const customAutomationInput = z.strictObject({
  name: z.string().trim().min(1).max(120), enabled: z.boolean().default(false), promotional: z.boolean().default(false),
  trigger: z.strictObject({
    type: z.enum(['REGISTRATION', 'SUBSCRIPTION_ACTIVATED', 'BEFORE_EXPIRY', 'AFTER_EXPIRY', 'SCHEDULED']),
    configuration: z.strictObject({ scheduledAt: z.iso.datetime({ offset: true }).optional(), leadMinutes: z.number().int().min(1).max(525600).optional() }).default({}),
  }),
  audience: z.strictObject({ type: z.enum(['ALL', 'FREE', 'ACTIVE', 'PLANS']).default('ALL'), planIds: z.array(id).max(30).default([]) }),
  messages: z.array(z.strictObject({
    order: z.number().int().min(0).max(19), text: z.string().trim().min(1).max(6000), imageId: id.nullable().default(null),
    buttons: z.array(z.array(z.strictObject({ label: z.string().trim().min(1).max(64), url: z.string().refine((value) => Boolean(safeHttpsUrl(value)), 'Use an HTTPS link') })).min(1).max(4)).max(8).default([]),
    delayMinutes: z.number().int().min(0).max(525600).default(0),
  })).min(1).max(20),
}).superRefine((value, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (value.trigger.type === 'SCHEDULED' && !value.trigger.configuration.scheduledAt) issue(['trigger'], 'Choose a scheduled date and time');
  if (value.trigger.type === 'BEFORE_EXPIRY' && !value.trigger.configuration.leadMinutes) issue(['trigger'], 'Choose how long before expiry to start');
  if (value.audience.type === 'PLANS' && !value.audience.planIds.length) issue(['audience'], 'Choose at least one plan');
  if (['BEFORE_EXPIRY', 'SUBSCRIPTION_ACTIVATED'].includes(value.trigger.type) && value.audience.type === 'FREE') issue(['audience'], 'Choose a subscription audience');
  if (value.trigger.type === 'AFTER_EXPIRY' && ['ACTIVE', 'PLANS'].includes(value.audience.type)) issue(['audience'], 'Expired users no longer have an active plan');
  value.messages.forEach((message, index) => {
    if (message.order !== index) issue(['messages', index, 'order'], 'Message order must match the list');
    try { renderBroadcastText(message.text); } catch (error) { issue(['messages', index, 'text'], error.message); }
    if (value.trigger.type === 'BEFORE_EXPIRY' && message.delayMinutes >= value.trigger.configuration.leadMinutes) issue(['messages', index, 'delayMinutes'], 'Send before the subscription expires');
  });
});
