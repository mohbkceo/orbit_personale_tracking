import { Router } from 'express';
import { Debt } from '../models/Debt.js';
import { validate } from '../middleware/validate.js';
import { debtInput, debtPaymentInput } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { createDebt, listDebts, recordDebtPayment } from '../services/debtService.js';

export const debtRoutes = Router();
debtRoutes.get('/', asyncHandler(async (req, res) => { const result = await listDebts(req.query); return success(res, result.data, 200, { pagination: result.pagination }); }));
debtRoutes.post('/', validate(debtInput), asyncHandler(async (req, res) => success(res, await createDebt(req.body), 201)));
debtRoutes.patch('/:id', validate(debtInput.partial()), asyncHandler(async (req, res) => {
  const debt = await Debt.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!debt) throw new AppError('Debt not found', 404);
  return success(res, debt);
}));
debtRoutes.post('/:id/payments', validate(debtPaymentInput), asyncHandler(async (req, res) => success(res, await recordDebtPayment(req.params.id, req.body), 201)));
debtRoutes.delete('/:id', asyncHandler(async (req, res) => { const debt = await Debt.findByIdAndUpdate(req.params.id, { archived: true }, { new: true }); if (!debt) throw new AppError('Debt not found', 404); return success(res, debt); }));
