import { Router } from 'express';
import { z } from 'zod';
import { Bill, Subscription } from '../models/Planning.js';
import { validate } from '../middleware/validate.js';
import { requireFeature } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { migrateWishlist } from '../services/wishlistMigrationService.js';
import { createTransaction, ensureAccount } from '../services/financeService.js';
import { payBill } from '../services/billService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { cancelEntityReminders, regenerateAutomaticReminderPlan } from '../services/reminders/reminderService.js';
import { changeGoalStep, createGoal, deleteGoal, getGoal, listGoals, updateGoal } from '../services/goalService.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const reminderMode = z.enum(['automatic', 'custom', 'off']).optional();
const billInput = z.object({ name: z.string().min(1), amount: z.coerce.number().positive(), category: z.string().default('Bills'), accountId: id.nullish(), dueDate: z.coerce.date(), status: z.enum(['upcoming', 'due', 'paid', 'overdue']).optional(), autoCreateExpense: z.boolean().default(true), notes: z.string().optional(), reminderMode });
const subscriptionInput = z.object({ name: z.string().min(1), amount: z.coerce.number().positive(), currency: z.string().length(3).default('DZD'), billingCycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']).default('monthly'), nextBillingDate: z.coerce.date(), accountId: id.nullish(), category: z.string().default('Subscriptions'), status: z.enum(['active', 'paused', 'cancelled']).default('active'), website: z.string().url().or(z.literal('')).optional(), notes: z.string().optional(), reminderMode });
export const goalInput = z.object({
  title: z.string().trim().min(1).max(240), description: z.string().max(5000).optional(),
  progressType: z.enum(['money', 'steps', 'simple']).optional(), type: z.enum(['financial', 'personal']).optional(),
  targetAmount: z.coerce.number().nonnegative().nullable().optional(), currentAmount: z.coerce.number().nonnegative().optional(),
  accountId: id.nullish(), currency: z.string().length(3).toUpperCase().optional(),
  targetDate: z.union([z.literal(''), z.null(), z.coerce.date()]).optional().transform((value) => value || null),
  status: z.enum(['active', 'completed', 'paused', 'cancelled']).optional(), notes: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(), url: z.string().url().or(z.literal('')).optional(), category: z.string().max(120).optional(),
  steps: z.array(z.object({ _id: id.optional(), title: z.string().trim().min(1).max(240), completed: z.boolean().optional() })).max(500).optional(),
  reminderMode,
});

function crudRoutes(Model, schema, sort, entityType) {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => success(res, await Model.find({ user: req.user._id }).populate({ path: 'accountId', match: { user: req.user._id } }).sort(sort))));
  router.post('/', validate(schema), asyncHandler(async (req, res) => { if (req.body.accountId) await ensureAccount(req.user._id, req.body.accountId); const settings = await getSettingsDocument(req.user._id); const item = await Model.create({ ...req.body, user: req.user._id, reminderMode: req.body.reminderMode || settings.reminders?.defaultEntityModes?.[entityType] || 'automatic' }); await regenerateAutomaticReminderPlan(req.user._id, entityType, item._id); return success(res, item, 201); }));
  router.patch('/:id', validate(schema.partial()), asyncHandler(async (req, res) => { if (req.body.accountId) await ensureAccount(req.user._id, req.body.accountId); const item = await Model.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, req.body, { new: true, runValidators: true }); if (!item) throw new AppError('Record not found', 404); if (['dueDate', 'nextBillingDate', 'targetDate', 'status', 'reminderMode'].some((key) => key in req.body)) await regenerateAutomaticReminderPlan(req.user._id, entityType, item._id); return success(res, item); }));
  router.delete('/:id', asyncHandler(async (req, res) => { const item = await Model.findOneAndDelete({ _id: req.params.id, user: req.user._id }); if (!item) throw new AppError('Record not found', 404); await cancelEntityReminders(req.user._id, entityType, item._id); return success(res, { deleted: true }); }));
  return router;
}

export const billRoutes = crudRoutes(Bill, billInput, { dueDate: 1 }, 'bill');
billRoutes.post('/:id/pay', validate(z.object({ accountId: id.optional(), date: z.coerce.date().optional() })), asyncHandler(async (req, res) => {
  return success(res, await payBill(req.user._id, req.params.id, req.body));
}));
export const subscriptionRoutes = crudRoutes(Subscription, subscriptionInput, { nextBillingDate: 1 }, 'subscription');
export const goalRoutes = Router();
for (const param of ['id', 'stepId']) goalRoutes.param(param, (req, _res, next, value) => next(id.safeParse(value).success ? undefined : new AppError('Record not found', 404)));
goalRoutes.get('/', asyncHandler(async (req, res) => {
  const migration = await migrateWishlist({ userId: req.user._id, dryRun: false });
  return success(res, await listGoals(req.user._id, { migrate: false }), 200, { migration: { errors: migration.errors, conflicts: migration.conflicts.length } });
}));
goalRoutes.get('/:id', asyncHandler(async (req, res) => success(res, await getGoal(req.user._id, req.params.id))));
goalRoutes.post('/', validate(goalInput), asyncHandler(async (req, res) => {
  const goal = await createGoal(req.user._id, req.body);
  return success(res, await getGoal(req.user._id, goal._id), 201);
}));
goalRoutes.patch('/:id', validate(goalInput.partial()), asyncHandler(async (req, res) => success(res, await updateGoal(req.user._id, req.params.id, req.body))));
goalRoutes.delete('/:id', asyncHandler(async (req, res) => { await deleteGoal(req.user._id, req.params.id); return success(res, { deleted: true }); }));
const stepInput = z.object({ title: z.string().trim().min(1).max(240), completed: z.boolean().optional() });
goalRoutes.post('/:id/steps', validate(stepInput), asyncHandler(async (req, res) => success(res, await changeGoalStep(req.user._id, req.params.id, null, req.body), 201)));
goalRoutes.patch('/:id/steps/:stepId', validate(stepInput.partial()), asyncHandler(async (req, res) => success(res, await changeGoalStep(req.user._id, req.params.id, req.params.stepId, req.body))));
goalRoutes.delete('/:id/steps/:stepId', asyncHandler(async (req, res) => success(res, await changeGoalStep(req.user._id, req.params.id, req.params.stepId, {}, true))));

for (const [action, type] of [['contribute', 'savings_contribution'], ['withdraw', 'savings_withdrawal']]) {
  goalRoutes.post(`/:id/${action}`, requireFeature('accounts'), requireFeature('transactions'), validate(z.object({ amount: z.coerce.number().positive(), accountId: id, destinationAccountId: id })), asyncHandler(async (req, res) => {
    const goal = await getGoal(req.user._id, req.params.id);
    await createTransaction(req.user._id, { ...req.body, type, category: 'Savings', description: `${action === 'contribute' ? 'Contribution to' : 'Withdrawal from'} ${goal.title}`.slice(0, 240), sourceEntityType: 'Goal', sourceEntityId: goal._id, createdVia: 'web' });
    return success(res, await getGoal(req.user._id, goal._id));
  }));
}
