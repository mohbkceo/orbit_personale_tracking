import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { transactionInput, transactionUpdate } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { archiveTransaction, createTransaction, listTransactions, updateTransaction } from '../services/financeService.js';
import { assertFeature } from '../services/entitlementService.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { AppError } from '../utils/AppError.js';

export const transactionRoutes = Router();

transactionRoutes.get('/', asyncHandler(async (req, res) => {
  const requested = req.query.type ? String(req.query.type).split(',') : TRANSACTION_TYPES;
  if (requested.some((type) => !TRANSACTION_TYPES.includes(type))) throw new AppError('Invalid transaction type', 422);
  if (req.query.type) for (const type of requested) if (type === 'expense' || type === 'income') await assertFeature(req.user, type === 'expense' ? 'expenses' : 'income');
  const permitted = requested.filter((type) => type !== 'expense' && type !== 'income' || req.entitlements.decisions[type === 'expense' ? 'expenses' : 'income']?.allowed);
  const result = await listTransactions(req.user._id, { ...req.query, type: permitted.join(',') });
  return success(res, result.data, 200, { pagination: result.pagination });
}));
transactionRoutes.post('/', validate(transactionInput), asyncHandler(async (req, res) => {
  if (req.body.type === 'expense' || req.body.type === 'income') await assertFeature(req.user, req.body.type === 'expense' ? 'expenses' : 'income');
  return success(res, await createTransaction(req.user._id, req.body), 201);
}));
transactionRoutes.patch('/:id', validate(transactionUpdate), asyncHandler(async (req, res) => {
  const current = await Transaction.findOne({ _id: req.params.id, user: req.user._id, deletedAt: null }).select('type').lean();
  if (!current) throw new AppError('Transaction not found', 404);
  for (const type of new Set([current.type, req.body.type].filter(Boolean))) if (type === 'expense' || type === 'income') await assertFeature(req.user, type === 'expense' ? 'expenses' : 'income');
  return success(res, await updateTransaction(req.user._id, req.params.id, req.body));
}));
transactionRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const current = await Transaction.findOne({ _id: req.params.id, user: req.user._id, deletedAt: null }).select('type').lean();
  if (!current) throw new AppError('Transaction not found', 404);
  if (current.type === 'expense' || current.type === 'income') await assertFeature(req.user, current.type === 'expense' ? 'expenses' : 'income');
  return success(res, await archiveTransaction(req.user._id, req.params.id));
}));
