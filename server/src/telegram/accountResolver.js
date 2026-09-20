import mongoose from 'mongoose';
import { Account } from '../models/Account.js';

export async function resolveTelegramAccount(userId, settings, direction, currency = settings.defaultCurrency) {
  const key = direction === 'out' ? 'defaultExpenseAccount' : 'defaultIncomeAccount';
  const id = settings.telegram?.[key];
  if (id && mongoose.isValidObjectId(id)) {
    const account = await Account.findOne({ _id: id, user: userId, archived: false });
    if (account && account.currency === currency) return { accountId: account._id };
  }
  const accounts = await Account.find({ user: userId, archived: false, currency }).select('_id');
  if (accounts.length === 1) return { accountId: accounts[0]._id };
  return { error: `Set a default ${direction === 'out' ? 'expense' : 'income'} account in Settings before recording this action.` };
}
