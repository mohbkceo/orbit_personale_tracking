import { Router } from 'express';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { validate } from '../middleware/validate.js';
import { accountInput } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { accountBalances } from '../services/financeService.js';
import { recordActivity } from '../services/activityService.js';

export const accountRoutes = Router();

accountRoutes.get('/', asyncHandler(async (req, res) => success(res, await accountBalances(req.query.includeArchived === 'true' ? {} : { archived: false }))));

accountRoutes.post('/', validate(accountInput), asyncHandler(async (req, res) => {
  const account = await Account.create(req.body);
  await recordActivity({ action: 'created', entityType: 'Account', entityId: account._id, description: `Created ${account.name}`, newData: account.toObject() });
  return success(res, { ...account.toObject(), currentBalance: account.openingBalance }, 201);
}));

accountRoutes.patch('/:id', validate(accountInput.partial()), asyncHandler(async (req, res) => {
  const account = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!account) throw new AppError('Account not found', 404);
  return success(res, account);
}));

accountRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const [account, linked] = await Promise.all([Account.findById(req.params.id), Transaction.exists({ $or: [{ accountId: req.params.id }, { destinationAccountId: req.params.id }], deletedAt: null })]);
  if (!account) throw new AppError('Account not found', 404);
  if (linked) throw new AppError('This account has financial history and can only be archived', 409);
  await account.deleteOne();
  return success(res, { deleted: true });
}));

accountRoutes.post('/:id/archive', asyncHandler(async (req, res) => {
  const account = await Account.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
  if (!account) throw new AppError('Account not found', 404);
  await recordActivity({ action: 'archived', entityType: 'Account', entityId: account._id, description: `Archived ${account.name}` });
  return success(res, account);
}));
