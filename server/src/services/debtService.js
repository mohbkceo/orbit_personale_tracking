import { Debt } from '../models/Debt.js';
import { Transaction } from '../models/Transaction.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, pagination } from '../utils/query.js';
import { recordActivity } from './activityService.js';
import { createTransaction, ensureAccount } from './financeService.js';

export async function createDebt(input) {
  const debt = await Debt.create({ ...input, remainingAmount: input.originalAmount });
  await recordActivity({ action: 'created', entityType: 'Debt', entityId: debt._id, description: `${debt.personName} · ${debt.type}`, newData: debt.toObject(), source: input.createdVia });
  return debt;
}

export async function listDebts(query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { archived: false };
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.search) filter.personName = new RegExp(escapeRegex(query.search), 'i');
  const [data, total] = await Promise.all([
    Debt.find(filter).populate('payments.accountId').sort({ dueDate: 1, createdAt: -1 }).skip(skip).limit(limit),
    Debt.countDocuments(filter),
  ]);
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function recordDebtPayment(id, input) {
  const debt = await Debt.findOne({ _id: id, archived: false });
  if (!debt) throw new AppError('Debt not found', 404);
  if (debt.status === 'paid') throw new AppError('This debt is already paid', 409);
  if (input.amount > debt.remainingAmount) throw new AppError('Payment exceeds the remaining balance');
  await ensureAccount(input.accountId);

  const transaction = await createTransaction({
    type: debt.type === 'receivable' ? 'debt_payment_in' : 'debt_payment_out',
    amount: input.amount, accountId: input.accountId, category: 'Debt payment',
    description: `${debt.type === 'receivable' ? 'Received from' : 'Paid to'} ${debt.personName}`,
    date: input.date || new Date(), sourceEntityType: 'Debt', sourceEntityId: debt._id,
    createdVia: input.createdVia || 'web', notes: input.notes,
  });

  try {
    debt.remainingAmount = Math.max(0, debt.remainingAmount - input.amount);
    debt.status = debt.remainingAmount === 0 ? 'paid' : 'partial';
    debt.payments.push({ ...input, transactionId: transaction._id });
    await debt.save();
  } catch (error) {
    await Transaction.deleteOne({ _id: transaction._id });
    throw error;
  }
  await recordActivity({ action: 'payment_recorded', entityType: 'Debt', entityId: debt._id, description: `Payment recorded for ${debt.personName}`, newData: { amount: input.amount, remainingAmount: debt.remainingAmount }, source: input.createdVia });
  return debt.populate('payments.accountId');
}
