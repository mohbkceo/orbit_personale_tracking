import { Bill } from '../models/Planning.js';
import { AppError } from '../utils/AppError.js';
import { createTransaction } from './financeService.js';
import { resolveEntityReminders } from './reminders/reminderService.js';

export async function payBill(userId, id, { accountId, date, createdVia = 'web' } = {}) {
  const bill = await Bill.findOne({ _id: id, user: userId });
  if (!bill) throw new AppError('Bill not found', 404);
  if (bill.status === 'paid') throw new AppError('Bill is already paid', 409);
  const paymentAccount = accountId || bill.accountId;
  if (bill.autoCreateExpense) {
    if (!paymentAccount) throw new AppError('Choose an account for the bill payment', 400);
    await createTransaction(userId, {
      type: 'expense',
      amount: bill.amount,
      accountId: paymentAccount,
      category: bill.category,
      description: bill.name,
      date: date || new Date(),
      sourceEntityType: 'Bill',
      sourceEntityId: bill._id,
      createdVia,
    });
  }
  bill.status = 'paid';
  await bill.save();
  await resolveEntityReminders(userId, 'bill', bill._id);
  return bill;
}
