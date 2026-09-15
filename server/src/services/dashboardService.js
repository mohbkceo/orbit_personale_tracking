import dayjs from 'dayjs';
import { Activity } from '../models/Activity.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { accountBalances } from './financeService.js';

export async function dashboardSummary() {
  const start = dayjs().startOf('month').toDate();
  const end = dayjs().endOf('month').toDate();
  const todayEnd = dayjs().endOf('day').toDate();
  const active = { deletedAt: null };
  const [accounts, totals, debtTotals, taskCounts, recentTransactions, upcomingBills, upcomingSubscriptions, goals, activity] = await Promise.all([
    accountBalances({ archived: false }),
    Transaction.aggregate([{ $match: { ...active, date: { $gte: start, $lte: end }, type: { $in: ['income', 'expense'] } } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Debt.aggregate([{ $match: { archived: false, status: { $ne: 'paid' } } }, { $group: { _id: '$type', total: { $sum: '$remainingAmount' } } }]),
    Task.aggregate([{ $match: { archived: false } }, { $group: { _id: '$status', total: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', new Date()] }, { $not: { $in: ['$status', ['completed', 'cancelled']] } }] }, 1, 0] } } } }]),
    Transaction.find(active).populate('accountId destinationAccountId').sort({ date: -1 }).limit(7),
    Bill.find({ status: { $ne: 'paid' }, dueDate: { $lte: dayjs().add(30, 'day').toDate() } }).sort({ dueDate: 1 }).limit(5),
    Subscription.find({ status: 'active', nextBillingDate: { $lte: dayjs().add(30, 'day').toDate() } }).sort({ nextBillingDate: 1 }).limit(5),
    Goal.find({ status: 'active' }).sort({ targetDate: 1 }).limit(4),
    Activity.find().sort({ createdAt: -1 }).limit(6),
  ]);
  const totalBalance = accounts.reduce((sum, item) => sum + item.currentBalance, 0);
  const income = totals.find((item) => item._id === 'income')?.total || 0;
  const expenses = totals.find((item) => item._id === 'expense')?.total || 0;
  const overdue = taskCounts.reduce((sum, item) => sum + item.overdue, 0);
  const openTasks = taskCounts.filter((item) => ['todo', 'in_progress'].includes(item._id)).reduce((sum, item) => sum + item.total, 0);
  return {
    money: { totalBalance, income, expenses, net: income - expenses }, accounts,
    debts: { receivable: debtTotals.find((item) => item._id === 'receivable')?.total || 0, payable: debtTotals.find((item) => item._id === 'payable')?.total || 0 },
    tasks: { open: openTasks, overdue, dueToday: await Task.countDocuments({ archived: false, status: { $in: ['todo', 'in_progress'] }, dueDate: { $gte: dayjs().startOf('day').toDate(), $lte: todayEnd } }) },
    recentTransactions, upcoming: [...upcomingBills.map((item) => ({ ...item.toObject(), kind: 'bill', date: item.dueDate })), ...upcomingSubscriptions.map((item) => ({ ...item.toObject(), kind: 'subscription', date: item.nextBillingDate }))].sort((a, b) => a.date - b.date).slice(0, 6),
    goals, activity,
  };
}

export async function dashboardCharts(months = 6) {
  const start = dayjs().subtract(months - 1, 'month').startOf('month').toDate();
  const trend = await Transaction.aggregate([
    { $match: { deletedAt: null, date: { $gte: start }, type: { $in: ['income', 'expense'] } } },
    { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' }, total: { $sum: '$amount' } } },
    { $sort: { '_id.month': 1 } },
  ]);
  const categories = await Transaction.aggregate([
    { $match: { deletedAt: null, type: 'expense', date: { $gte: dayjs().startOf('month').toDate() } } },
    { $group: { _id: '$category', value: { $sum: '$amount' } } }, { $sort: { value: -1 } }, { $limit: 8 },
  ]);
  const monthMap = new Map();
  for (let i = months - 1; i >= 0; i -= 1) { const key = dayjs().subtract(i, 'month').format('YYYY-MM'); monthMap.set(key, { month: dayjs(key).format('MMM'), income: 0, expenses: 0 }); }
  trend.forEach((item) => { const row = monthMap.get(item._id.month); if (row) row[item._id.type === 'expense' ? 'expenses' : 'income'] = item.total; });
  return { cashflow: [...monthMap.values()], categories: categories.map((item) => ({ name: item._id, value: item.value })) };
}
