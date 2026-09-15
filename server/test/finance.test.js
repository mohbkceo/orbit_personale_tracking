import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Account } from '../src/models/Account.js';
import { Transaction } from '../src/models/Transaction.js';
import { Debt } from '../src/models/Debt.js';
import { accountBalances, createTransaction } from '../src/services/financeService.js';
import { recordDebtPayment } from '../src/services/debtService.js';

let mongo;
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await connectDatabase(mongo.getUri()); });
afterAll(async () => { await disconnectDatabase(); await mongo.stop(); });
beforeEach(async () => Promise.all([Account.deleteMany(), Transaction.deleteMany(), Debt.deleteMany()]));

describe('financial ledger', () => {
  it('applies income, expenses and transfers without changing total net worth on transfer', async () => {
    const [cash, bank] = await Account.create([{ name: 'Cash', type: 'cash', openingBalance: 1000 }, { name: 'Bank', type: 'bank', openingBalance: 4000 }]);
    await createTransaction({ type: 'income', amount: 500, accountId: bank._id, description: 'Income' });
    await createTransaction({ type: 'expense', amount: 200, accountId: cash._id, description: 'Expense' });
    await createTransaction({ type: 'transfer', amount: 1000, accountId: bank._id, destinationAccountId: cash._id, description: 'Transfer' });
    const balances = await accountBalances({});
    expect(balances.find((a) => a.name === 'Cash').currentBalance).toBe(1800);
    expect(balances.find((a) => a.name === 'Bank').currentBalance).toBe(3500);
    expect(balances.reduce((sum, a) => sum + a.currentBalance, 0)).toBe(5300);
  });

  it('records a receivable payment exactly once in the ledger', async () => {
    const account = await Account.create({ name: 'Cash', type: 'cash' });
    const debt = await Debt.create({ personName: 'Ahmed', type: 'receivable', originalAmount: 5000, remainingAmount: 5000 });
    const updated = await recordDebtPayment(debt._id, { amount: 2000, accountId: account._id });
    expect(updated.remainingAmount).toBe(3000);
    expect(await Transaction.countDocuments({ sourceEntityId: debt._id })).toBe(1);
    expect((await accountBalances({}))[0].currentBalance).toBe(2000);
  });
});
