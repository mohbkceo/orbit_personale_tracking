import { Router } from 'express';
import { z } from 'zod';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { createTransaction, ensureAccount } from '../services/financeService.js';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const billInput = z.object({ name: z.string().min(1), amount: z.coerce.number().positive(), category: z.string().default('Bills'), accountId: id.nullish(), dueDate: z.coerce.date(), status: z.enum(['upcoming', 'due', 'paid', 'overdue']).optional(), autoCreateExpense: z.boolean().default(true), notes: z.string().optional() });
const subscriptionInput = z.object({ name: z.string().min(1), amount: z.coerce.number().positive(), currency: z.string().length(3).default('DZD'), billingCycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom']).default('monthly'), nextBillingDate: z.coerce.date(), accountId: id.nullish(), category: z.string().default('Subscriptions'), status: z.enum(['active', 'paused', 'cancelled']).default('active'), website: z.string().url().or(z.literal('')).optional(), notes: z.string().optional() });
const goalInput = z.object({ title: z.string().min(1), description: z.string().optional(), type: z.enum(['financial', 'personal']).default('financial'), targetAmount: z.coerce.number().nonnegative().optional(), currentAmount: z.coerce.number().nonnegative().default(0), accountId: id.nullish(), targetDate: z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((v) => v || null), status: z.enum(['active', 'completed', 'paused', 'cancelled']).default('active'), notes: z.string().optional() });

function crudRoutes(Model, schema, sort) {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => success(res, await Model.find({ user: req.user._id }).populate({ path: 'accountId', match: { user: req.user._id } }).sort(sort))));
  router.post('/', validate(schema), asyncHandler(async (req, res) => { if (req.body.accountId) await ensureAccount(req.user._id, req.body.accountId); return success(res, await Model.create({ ...req.body, user: req.user._id }), 201); }));
  router.patch('/:id', validate(schema.partial()), asyncHandler(async (req, res) => { if (req.body.accountId) await ensureAccount(req.user._id, req.body.accountId); const item = await Model.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, req.body, { new: true, runValidators: true }); if (!item) throw new AppError('Record not found', 404); return success(res, item); }));
  router.delete('/:id', asyncHandler(async (req, res) => { const item = await Model.findOneAndDelete({ _id: req.params.id, user: req.user._id }); if (!item) throw new AppError('Record not found', 404); return success(res, { deleted: true }); }));
  return router;
}

export const billRoutes = crudRoutes(Bill, billInput, { dueDate: 1 });
billRoutes.post('/:id/pay', validate(z.object({ accountId: id.optional(), date: z.coerce.date().optional() })), asyncHandler(async (req, res) => {
  const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
  if (!bill) throw new AppError('Bill not found', 404);
  if (bill.status === 'paid') throw new AppError('Bill is already paid', 409);
  const accountId = req.body.accountId || bill.accountId;
  if (bill.autoCreateExpense) await createTransaction(req.user._id, { type: 'expense', amount: bill.amount, accountId, category: bill.category, description: bill.name, date: req.body.date || new Date(), sourceEntityType: 'Bill', sourceEntityId: bill._id, createdVia: 'web' });
  bill.status = 'paid'; await bill.save();
  return success(res, bill);
}));
export const subscriptionRoutes = crudRoutes(Subscription, subscriptionInput, { nextBillingDate: 1 });
export const goalRoutes = crudRoutes(Goal, goalInput, { targetDate: 1 });
goalRoutes.post('/:id/contribute', validate(z.object({ amount: z.coerce.number().positive(), accountId: id, destinationAccountId: id })), asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id }); if (!goal) throw new AppError('Goal not found', 404);
  await createTransaction(req.user._id, { type: 'savings_contribution', amount: req.body.amount, accountId: req.body.accountId, destinationAccountId: req.body.destinationAccountId, category: 'Savings', description: `Contribution to ${goal.title}`, sourceEntityType: 'Goal', sourceEntityId: goal._id, createdVia: 'web' });
  goal.currentAmount += req.body.amount; if (goal.targetAmount && goal.currentAmount >= goal.targetAmount) goal.status = 'completed'; await goal.save();
  return success(res, goal);
}));
goalRoutes.post('/:id/withdraw', validate(z.object({ amount: z.coerce.number().positive(), accountId: id, destinationAccountId: id })), asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id }); if (!goal) throw new AppError('Goal not found', 404);
  if (req.body.amount > goal.currentAmount) throw new AppError('Withdrawal exceeds the saved amount');
  await createTransaction(req.user._id, { type: 'savings_withdrawal', amount: req.body.amount, accountId: req.body.accountId, destinationAccountId: req.body.destinationAccountId, category: 'Savings', description: `Withdrawal from ${goal.title}`, sourceEntityType: 'Goal', sourceEntityId: goal._id, createdVia: 'web' });
  goal.currentAmount -= req.body.amount; if (goal.status === 'completed' && goal.currentAmount < goal.targetAmount) goal.status = 'active'; await goal.save();
  return success(res, goal);
}));
