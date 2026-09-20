import { z } from 'zod';
import { TRANSACTION_TYPES } from '../models/Transaction.js';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const optionalDate = z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((value) => value || null);
const optionalId = z.union([id, z.literal(''), z.null()]).optional().transform((value) => value || null);
const reminderMode = z.enum(['automatic', 'custom', 'off']);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezone = z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Invalid timezone');
const taskRecurrence = z.object({ frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']), interval: z.coerce.number().int().min(1).max(365).default(1), daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(), dayOfMonth: z.coerce.number().int().min(1).max(31).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional() });

export const accountInput = z.object({
  name: z.string().trim().min(1).max(80), type: z.enum(['cash', 'bank', 'savings', 'wallet', 'other']),
  currency: z.string().trim().length(3).toUpperCase().default('DZD'), openingBalance: z.coerce.number().default(0),
  icon: z.string().optional(), color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(), archived: z.boolean().optional(),
});

export const transactionInput = z.object({
  type: z.enum(TRANSACTION_TYPES), amount: z.coerce.number().positive(), accountId: id,
  destinationAccountId: id.nullish(), category: z.string().trim().max(80).default('Other'),
  description: z.string().trim().min(1).max(240), date: z.coerce.date().default(() => new Date()),
  sourceEntityType: z.string().nullish(), sourceEntityId: id.nullish(), createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
  tags: z.array(z.string()).default([]), notes: z.string().max(2000).default(''), recurring: z.boolean().default(false),
  saleDetails: z.object({ business: z.string().max(120).optional(), product: z.string().max(240).optional(), quantity: z.coerce.number().int().min(1).optional(), customerName: z.string().max(120).optional() }).optional(),
});

export const transactionUpdate = transactionInput.partial();

export const debtInput = z.object({
  personName: z.string().trim().min(1).max(120), personId: id.nullish(), type: z.enum(['receivable', 'payable']),
  originalAmount: z.coerce.number().positive(), currency: z.string().length(3).toUpperCase().default('DZD'),
  description: z.string().max(500).default(''), date: z.coerce.date().default(() => new Date()), dueDate: optionalDate,
  createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
  reminderMode: reminderMode.optional(),
});

export const debtPaymentInput = z.object({
  amount: z.coerce.number().positive(), accountId: id, date: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).default(''), createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
});

export const taskInput = z.object({
  title: z.string().trim().min(1).max(180), description: z.string().max(3000).default(''),
  status: z.enum(['todo', 'in_progress', 'completed', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), dueDate: optionalDate,
  dueTime: z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/).default(''), category: z.string().max(80).default('Personal'), projectId: id.nullish(),
  recurring: z.boolean().default(false), recurringRule: taskRecurrence.optional(), tags: z.array(z.string()).default([]), createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
  reminderMode: reminderMode.optional(),
});

export const taskUpdate = taskInput.partial();

export const settingsInput = z.object({
  name: z.string().max(100).optional(), timezone: timezone.optional(), defaultCurrency: z.string().length(3).optional(),
  dateFormat: z.string().max(40).optional(), weekStartsOn: z.coerce.number().int().min(0).max(6).optional(), theme: z.enum(['light', 'dark', 'system']).optional(),
  expenseCategories: z.array(z.string().min(1)).optional(), incomeCategories: z.array(z.string().min(1)).optional(),
  telegram: z.object({
    defaultExpenseAccount: optionalId, defaultIncomeAccount: optionalId, dailySummaryEnabled: z.boolean().optional(),
    dailySummaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), morningSummaryEnabled: z.boolean().optional(),
    morningSummaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  }).optional(),
  reminders: z.object({
    enabled: z.boolean().optional(), automaticEnabled: z.boolean().optional(),
    activeHours: z.object({ start: clock.optional(), end: clock.optional() }).optional(),
    quietHours: z.object({ enabled: z.boolean().optional(), start: clock.optional(), end: clock.optional() }).optional(),
    incompleteFollowUpsEnabled: z.boolean().optional(), maxAutomaticFollowUps: z.coerce.number().int().min(0).max(5).optional(),
    minimumReminderSpacingMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    defaultEntityModes: z.object({ task: reminderMode.optional(), debt: reminderMode.optional(), bill: reminderMode.optional(), subscription: reminderMode.optional(), goal: reminderMode.optional() }).optional(),
    deliveryChannels: z.object({ telegram: z.boolean().optional(), web: z.boolean().optional() }).optional(),
  }).optional(),
});

const recurrence = z.object({ frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']), interval: z.coerce.number().int().min(1).max(365).default(1), daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(), dayOfMonth: z.coerce.number().int().min(1).max(31).optional(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional() }).refine((value) => !value.endDate || !value.startDate || value.endDate >= value.startDate, 'End date must follow start date');
const reminderBase = z.object({
  title: z.string().trim().min(1).max(180), message: z.string().max(2000).optional(),
  entityType: z.enum(['task', 'debt', 'bill', 'subscription', 'goal', 'custom']).default('custom'), entityId: id.nullish(),
  purpose: z.enum(['prepare', 'act', 'follow_up', 'review']).optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  trigger: z.object({ type: z.enum(['datetime', 'relative', 'recurring', 'entity_event']).default('datetime'), at: z.coerce.date(), timezone: timezone.optional(), anchor: z.string().max(80).optional(), offsetMinutes: z.coerce.number().int().optional(), recurrence: recurrence.optional() }),
  nextTriggerAt: z.coerce.date().optional(), requireAcknowledgement: z.boolean().optional(),
  followUp: z.object({ enabled: z.boolean().optional(), delayMinutes: z.coerce.number().int().min(30).max(10080).optional(), maxCount: z.coerce.number().int().min(0).max(3).optional() }).optional(),
  deliveryChannels: z.array(z.enum(['telegram', 'web'])).min(1).max(2).optional(),
});
export const reminderInput = reminderBase.superRefine((value, context) => {
  if (value.entityType === 'custom' ? !!value.entityId : !value.entityId) context.addIssue({ code: 'custom', path: ['entityId'], message: 'Entity ID must match entity type' });
  if (value.trigger.type === 'recurring' && !value.trigger.recurrence?.frequency) context.addIssue({ code: 'custom', path: ['trigger'], message: 'A recurrence rule is required' });
  if (value.trigger.at.getTime() <= Date.now() - 60000) context.addIssue({ code: 'custom', path: ['trigger'], message: 'Choose a future reminder time' });
});
export const reminderUpdate = reminderBase.partial();
