import { z } from 'zod';
import { TRANSACTION_TYPES } from '../models/Transaction.js';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const optionalDate = z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((value) => value || null);
const optionalId = z.union([id, z.literal(''), z.null()]).optional().transform((value) => value || null);

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
});

export const transactionUpdate = transactionInput.partial();

export const debtInput = z.object({
  personName: z.string().trim().min(1).max(120), personId: id.nullish(), type: z.enum(['receivable', 'payable']),
  originalAmount: z.coerce.number().positive(), currency: z.string().length(3).toUpperCase().default('DZD'),
  description: z.string().max(500).default(''), date: z.coerce.date().default(() => new Date()), dueDate: optionalDate,
  createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
});

export const debtPaymentInput = z.object({
  amount: z.coerce.number().positive(), accountId: id, date: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).default(''), createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
});

export const taskInput = z.object({
  title: z.string().trim().min(1).max(180), description: z.string().max(3000).default(''),
  status: z.enum(['todo', 'in_progress', 'completed', 'cancelled']).default('todo'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), dueDate: optionalDate,
  dueTime: z.string().max(8).default(''), category: z.string().max(80).default('Personal'), projectId: id.nullish(),
  recurring: z.boolean().default(false), tags: z.array(z.string()).default([]), createdVia: z.enum(['web', 'telegram', 'system']).default('web'),
});

export const taskUpdate = taskInput.partial();

export const settingsInput = z.object({
  name: z.string().max(100).optional(), timezone: z.string().max(100).optional(), defaultCurrency: z.string().length(3).optional(),
  dateFormat: z.string().max(40).optional(), weekStartsOn: z.coerce.number().int().min(0).max(6).optional(), theme: z.enum(['light', 'dark', 'system']).optional(),
  expenseCategories: z.array(z.string().min(1)).optional(), incomeCategories: z.array(z.string().min(1)).optional(),
  telegram: z.object({
    defaultExpenseAccount: optionalId, defaultIncomeAccount: optionalId, dailySummaryEnabled: z.boolean().optional(),
    dailySummaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), morningSummaryEnabled: z.boolean().optional(),
    morningSummaryTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  }).optional(),
});
