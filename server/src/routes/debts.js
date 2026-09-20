import { Router } from 'express';
import { Debt } from '../models/Debt.js';
import { Contact } from '../models/Personal.js';
import { validate } from '../middleware/validate.js';
import { debtInput, debtPaymentInput } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { createDebt, listDebts, recordDebtPayment } from '../services/debtService.js';
import { cancelEntityReminders, regenerateAutomaticReminderPlan } from '../services/reminders/reminderService.js';

export const debtRoutes = Router();
debtRoutes.get('/', asyncHandler(async (req, res) => { const result = await listDebts(req.user._id, req.query); return success(res, result.data, 200, { pagination: result.pagination }); }));
debtRoutes.post('/', validate(debtInput), asyncHandler(async (req, res) => success(res, await createDebt(req.user._id, req.body), 201)));
debtRoutes.patch('/:id', validate(debtInput.partial()), asyncHandler(async (req, res) => {
  if (req.body.personId && !(await Contact.exists({ _id: req.body.personId, user: req.user._id }))) throw new AppError('Contact not found', 404);
  const debt = await Debt.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, req.body, { new: true, runValidators: true });
  if (!debt) throw new AppError('Debt not found', 404);
  if (['dueDate', 'reminderMode', 'status', 'remainingAmount'].some((key) => key in req.body)) await regenerateAutomaticReminderPlan(req.user._id, 'debt', debt._id);
  return success(res, debt);
}));
debtRoutes.post('/:id/payments', validate(debtPaymentInput), asyncHandler(async (req, res) => success(res, await recordDebtPayment(req.user._id, req.params.id, req.body), 201)));
debtRoutes.delete('/:id', asyncHandler(async (req, res) => { const debt = await Debt.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { archived: true }, { new: true }); if (!debt) throw new AppError('Debt not found', 404); await cancelEntityReminders(req.user._id, 'debt', debt._id); return success(res, debt); }));
