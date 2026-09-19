import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pagination } from '../utils/query.js';
import { recordActivity } from './activityService.js';

const destinationTypes = ['transfer', 'savings_contribution', 'savings_withdrawal'];

export async function ensureAccount(userId, id, label = 'Account') {
  if (!mongoose.isValidObjectId(id)) throw new AppError(`${label} is invalid`, 400);
  const account = await Account.findOne({ _id: id, user: userId, archived: false });
  if (!account) throw new AppError(`${label} was not found`, 404);
  return account;
}

export async function createTransaction(userId, input) {
  const account = await ensureAccount(userId, input.accountId);
  let destination;
  if (destinationTypes.includes(input.type)) {
    if (!input.destinationAccountId) throw new AppError('A destination account is required');
    if (String(input.accountId) === String(input.destinationAccountId)) throw new AppError('Source and destination accounts must differ');
    destination = await ensureAccount(userId, input.destinationAccountId, 'Destination account');
    if (destination.currency !== account.currency) throw new AppError('Cross-currency transfers are not supported yet');
  }
  const transaction = await Transaction.create({ ...input, user: userId });
  await recordActivity(userId, {
    action: 'created', entityType: 'Transaction', entityId: transaction._id,
    description: `${transaction.type.replaceAll('_', ' ')} · ${transaction.description}`,
    newData: { amount: transaction.amount, type: transaction.type }, source: input.createdVia,
  });
  return transaction.populate([{ path: 'accountId', match: { user: userId } }, { path: 'destinationAccountId', match: { user: userId } }]);
}

export async function updateTransaction(userId, id, input) {
  const current = await Transaction.findOne({ _id: id, user: userId, deletedAt: null });
  if (!current) throw new AppError('Transaction not found', 404);
  const merged = { ...current.toObject(), ...input };
  await ensureAccount(userId, merged.accountId);
  if (destinationTypes.includes(merged.type)) await ensureAccount(userId, merged.destinationAccountId, 'Destination account');
  Object.assign(current, input);
  await current.save();
  await recordActivity(userId, { action: 'updated', entityType: 'Transaction', entityId: current._id, description: `Updated ${current.description}`, previousData: input, newData: current.toObject() });
  return current.populate([{ path: 'accountId', match: { user: userId } }, { path: 'destinationAccountId', match: { user: userId } }]);
}

export async function archiveTransaction(userId, id, source = 'web') {
  const transaction = await Transaction.findOneAndUpdate({ _id: id, user: userId, deletedAt: null }, { deletedAt: new Date() }, { new: true });
  if (!transaction) throw new AppError('Transaction not found', 404);
  await recordActivity(userId, { action: 'archived', entityType: 'Transaction', entityId: transaction._id, description: `Archived ${transaction.description}`, source });
  return transaction;
}

export async function listTransactions(userId, query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { user: userId, deletedAt: null };
  if (query.type) filter.type = query.type.includes(',') ? { $in: query.type.split(',') } : query.type;
  if (query.accountId) filter.$or = [{ accountId: query.accountId }, { destinationAccountId: query.accountId }];
  if (query.category) filter.category = query.category;
  if (query.from || query.to) filter.date = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
  if (query.search) filter.$and = [{ $or: [{ description: new RegExp(escapeRegex(query.search), 'i') }, { category: new RegExp(escapeRegex(query.search), 'i') }] }];
  const [data, total] = await Promise.all([
    Transaction.find(filter).populate([{ path: 'accountId', match: { user: userId } }, { path: 'destinationAccountId', match: { user: userId } }]).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function accountBalances(userId, accountFilter = {}) {
  const accounts = await Account.find({ ...accountFilter, user: userId }).sort({ archived: 1, createdAt: 1 }).lean();
  const movements = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), deletedAt: null } },
    {
      $project: {
        movements: {
          $concatArrays: [
            [{ accountId: '$accountId', amount: { $cond: [{ $in: ['$type', ['income', 'debt_payment_in', 'adjustment']] }, '$amount', { $multiply: ['$amount', -1] }] } }],
            { $cond: [{ $and: [{ $ne: ['$destinationAccountId', null] }, { $in: ['$type', destinationTypes] }] }, [{ accountId: '$destinationAccountId', amount: '$amount' }], []] },
          ],
        },
      },
    },
    { $unwind: '$movements' },
    { $group: { _id: '$movements.accountId', movement: { $sum: '$movements.amount' } } },
  ]);
  const byId = new Map(movements.map((item) => [String(item._id), item.movement]));
  return accounts.map((account) => ({ ...account, currentBalance: account.openingBalance + (byId.get(String(account._id)) || 0) }));
}
