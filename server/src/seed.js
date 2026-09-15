import dayjs from 'dayjs';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { Account } from './models/Account.js';
import { Transaction } from './models/Transaction.js';
import { Task } from './models/Task.js';
import { Debt } from './models/Debt.js';
import { Bill, Goal, Subscription } from './models/Planning.js';
import { Activity } from './models/Activity.js';
import { Setting } from './models/Setting.js';

if (process.env.NODE_ENV === 'production') throw new Error('Seed is disabled in production');
await connectDatabase();
await Promise.all([Account.deleteMany(), Transaction.deleteMany(), Task.deleteMany(), Debt.deleteMany(), Bill.deleteMany(), Subscription.deleteMany(), Goal.deleteMany(), Activity.deleteMany(), Setting.deleteMany()]);

const [cash, bank, savings] = await Account.create([
  { name: 'Cash', type: 'cash', openingBalance: 18000, color: '#16a34a' },
  { name: 'Main bank', type: 'bank', openingBalance: 192000, color: '#2563eb' },
  { name: 'Savings', type: 'savings', openingBalance: 54000, color: '#7c3aed' },
]);
await Transaction.create([
  { type: 'income', amount: 78000, accountId: bank._id, category: 'Salary', description: 'Monthly salary', date: dayjs().subtract(8, 'day').toDate() },
  { type: 'income', amount: 24500, accountId: bank._id, category: 'Freelance', description: 'Product design project', date: dayjs().subtract(4, 'day').toDate() },
  { type: 'expense', amount: 4200, accountId: cash._id, category: 'Food', description: 'Weekly groceries', date: dayjs().subtract(2, 'day').toDate() },
  { type: 'expense', amount: 1600, accountId: cash._id, category: 'Transport', description: 'Fuel', date: dayjs().subtract(1, 'day').toDate() },
  { type: 'transfer', amount: 20000, accountId: bank._id, destinationAccountId: savings._id, category: 'Transfer', description: 'Monthly savings', date: dayjs().subtract(3, 'day').toDate() },
]);
await Task.create([
  { title: 'Review monthly budget', priority: 'high', dueDate: new Date(), category: 'Finance' },
  { title: 'Call the dentist', priority: 'medium', dueDate: dayjs().add(1, 'day').toDate(), category: 'Health' },
  { title: 'Prepare project outline', priority: 'urgent', status: 'in_progress', dueDate: dayjs().subtract(1, 'day').toDate(), category: 'Work' },
]);
await Debt.create({ personName: 'Ahmed', type: 'receivable', originalAmount: 50000, remainingAmount: 35000, currency: 'DZD', dueDate: dayjs().add(5, 'day').toDate(), payments: [{ amount: 15000, accountId: cash._id, date: dayjs().subtract(5, 'day').toDate() }] });
await Goal.create([{ title: 'Emergency fund', type: 'financial', targetAmount: 300000, currentAmount: 186000, targetDate: dayjs().add(5, 'month').toDate() }, { title: 'New laptop', type: 'financial', targetAmount: 220000, currentAmount: 77000, targetDate: dayjs().add(3, 'month').toDate() }]);
await Bill.create({ name: 'Home internet', amount: 4200, category: 'Bills', accountId: bank._id, dueDate: dayjs().add(3, 'day').toDate(), autoCreateExpense: true });
await Subscription.create({ name: 'Cloud storage', amount: 1500, currency: 'DZD', billingCycle: 'monthly', nextBillingDate: dayjs().add(6, 'day').toDate(), accountId: bank._id });
await Setting.create({ telegram: { defaultExpenseAccount: cash._id, defaultIncomeAccount: bank._id } });
console.log('Development data seeded');
await disconnectDatabase();
