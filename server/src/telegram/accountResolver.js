import mongoose from 'mongoose';
import { Account } from '../models/Account.js';
import { telegramText } from '../i18n/telegram.js';

export async function resolveTelegramAccount(userId, settings, direction, currency = settings.defaultCurrency) {
  const key = direction === 'out' ? 'defaultExpenseAccount' : 'defaultIncomeAccount';
  const id = settings.telegram?.[key];
  if (id && mongoose.isValidObjectId(id)) {
    const account = await Account.findOne({ _id: id, user: userId, archived: false });
    if (account && account.currency === currency) return { accountId: account._id };
  }
  const accounts = await Account.find({ user: userId, archived: false, currency }).select('_id');
  if (accounts.length === 1) return { accountId: accounts[0]._id };
  const accountType = telegramText(settings, direction === 'out' ? 'expense' : 'income');
  return { error: telegramText(settings, 'accountRequired', { direction: settings.language === 'ar' ? accountType : accountType.toLowerCase() }) };
}
