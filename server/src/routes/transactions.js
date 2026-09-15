import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { transactionInput, transactionUpdate } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { archiveTransaction, createTransaction, listTransactions, updateTransaction } from '../services/financeService.js';

export const transactionRoutes = Router();

transactionRoutes.get('/', asyncHandler(async (req, res) => {
  const result = await listTransactions(req.query);
  return success(res, result.data, 200, { pagination: result.pagination });
}));
transactionRoutes.post('/', validate(transactionInput), asyncHandler(async (req, res) => success(res, await createTransaction(req.body), 201)));
transactionRoutes.patch('/:id', validate(transactionUpdate), asyncHandler(async (req, res) => success(res, await updateTransaction(req.params.id, req.body))));
transactionRoutes.delete('/:id', asyncHandler(async (req, res) => success(res, await archiveTransaction(req.params.id))));
