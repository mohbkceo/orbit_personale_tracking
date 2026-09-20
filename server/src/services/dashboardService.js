import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import mongoose from 'mongoose';
import { Activity } from '../models/Activity.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { accountBalances } from './financeService.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function telegramFinancialSummary(userId, zone = 'Africa/Algiers') {
  const now = dayjs().tz(zone);
  const today = dayjs.tz(now.format('YYYY-MM-DD'), zone).toDate();
  const tomorrow = dayjs.tz(now.add(1, 'day').format('YYYY-MM-DD'), zone).toDate();
  const month = dayjs.tz(now.startOf('month').format('YYYY-MM-DD'), zone).toDate();
  const nextMonth = dayjs.tz(now.add(1, 'month').startOf('month').format('YYYY-MM-DD'), zone).toDate();
  const totals = await Transaction.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId), deletedAt: null, type: { $in: ['income', 'expense'] }, date: { $gte: month, $lt: nextMonth } } },
    { $group: { _id: { period: { $cond: [{ $and: [{ $gte: ['$date', today] }, { $lt: ['$date', tomorrow] }] }, 'today', 'month'] }, type: '$type', category: '$category' }, amount: { $sum: '$amount' } } },
  ]);
  const sum = (period, predicate) => totals.filter((row) => (period === 'month' || row._id.period === 'today') && predicate(row._id)).reduce((total, row) => total + row.amount, 0);
  const summary = {};
  for (const period of ['today', 'month']) {
    const sales = sum(period, (id) => id.type === 'income' && id.category === 'Sale');
    const otherIncome = sum(period, (id) => id.type === 'income' && id.category !== 'Sale');
    const expenses = sum(period, (id) => id.type === 'expense');
    summary[period] = { sales, otherIncome, expenses, income: sales + otherIncome, net: sales + otherIncome - expenses };
  }
  return summary;
}

export async function dashboardSummary(userId, options = {}) {
  const user = new mongoose.Types.ObjectId(userId);
  const local = options.timezone ? dayjs().tz(options.timezone) : dayjs();
  const start = options.timezone ? dayjs.tz(local.startOf('month').format('YYYY-MM-DD'), options.timezone).toDate() : dayjs().startOf('month').toDate();
  const end = options.timezone ? dayjs.tz(local.add(1, 'month').startOf('month').format('YYYY-MM-DD'), options.timezone).toDate() : dayjs().endOf('month').toDate();
  const todayStart = new Date(`${local.format('YYYY-MM-DD')}T00:00:00.000Z`);
  const todayEnd = new Date(`${local.add(1, 'day').format('YYYY-MM-DD')}T00:00:00.000Z`);
  const active = { user, deletedAt: null };
  const [accounts, totals, debtTotals, taskCounts, recentTransactions, upcomingBills, upcomingSubscriptions, goals, activity] = await Promise.all([
    accountBalances(userId, { archived: false }),
    Transaction.aggregate([{ $match: { ...active, date: { $gte: start, ...(options.timezone ? { $lt: end } : { $lte: end }) }, type: { $in: ['income', 'expense'] } } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]),
    Debt.aggregate([{ $match: { user, archived: false, status: { $ne: 'paid' } } }, { $group: { _id: '$type', total: { $sum: '$remainingAmount' } } }]),
    Task.aggregate([{ $match: { user, archived: false } }, { $group: { _id: '$status', total: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $lt: ['$dueDate', options.timezone ? todayStart : new Date()] }, { $not: { $in: ['$status', ['completed', 'cancelled']] } }] }, 1, 0] } } } }]),
    Transaction.find(active).populate([{ path: 'accountId', match: { user } }, { path: 'destinationAccountId', match: { user } }]).sort({ date: -1 }).limit(7),
    Bill.find({ user, status: { $ne: 'paid' }, dueDate: { $lte: dayjs().add(30, 'day').toDate() } }).sort({ dueDate: 1 }).limit(5),
    Subscription.find({ user, status: 'active', nextBillingDate: { $lte: dayjs().add(30, 'day').toDate() } }).sort({ nextBillingDate: 1 }).limit(5),
    Goal.find({ user, status: 'active' }).sort({ targetDate: 1 }).limit(4),
    Activity.find({ user }).sort({ createdAt: -1 }).limit(6),
  ]);
  const totalBalance = accounts.reduce((sum, item) => sum + item.currentBalance, 0);
  const income = totals.find((item) => item._id === 'income')?.total || 0;
  const expenses = totals.find((item) => item._id === 'expense')?.total || 0;
  const overdue = taskCounts.reduce((sum, item) => sum + item.overdue, 0);
  const openTasks = taskCounts.filter((item) => ['todo', 'in_progress'].includes(item._id)).reduce((sum, item) => sum + item.total, 0);
  return {
    money: { totalBalance, income, expenses, net: income - expenses }, accounts,
    debts: { receivable: debtTotals.find((item) => item._id === 'receivable')?.total || 0, payable: debtTotals.find((item) => item._id === 'payable')?.total || 0 },
    tasks: { open: openTasks, overdue, dueToday: await Task.countDocuments({ user, archived: false, status: { $in: ['todo', 'in_progress'] }, dueDate: { $gte: options.timezone ? todayStart : dayjs().startOf('day').toDate(), ...(options.timezone ? { $lt: todayEnd } : { $lte: dayjs().endOf('day').toDate() }) } }) },
    recentTransactions, upcoming: [...upcomingBills.map((item) => ({ ...item.toObject(), kind: 'bill', date: item.dueDate })), ...upcomingSubscriptions.map((item) => ({ ...item.toObject(), kind: 'subscription', date: item.nextBillingDate }))].sort((a, b) => a.date - b.date).slice(0, 6),
    goals, activity,
  };
}

export async function dashboardCharts(userId, months = 6) {
  const user = new mongoose.Types.ObjectId(userId);
  const start = dayjs().subtract(months - 1, 'month').startOf('month').toDate();
  const trend = await Transaction.aggregate([
    { $match: { user, deletedAt: null, date: { $gte: start }, type: { $in: ['income', 'expense'] } } },
    { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, type: '$type' }, total: { $sum: '$amount' } } },
    { $sort: { '_id.month': 1 } },
  ]);
  const categories = await Transaction.aggregate([
    { $match: { user, deletedAt: null, type: 'expense', date: { $gte: dayjs().startOf('month').toDate() } } },
    { $group: { _id: '$category', value: { $sum: '$amount' } } }, { $sort: { value: -1 } }, { $limit: 8 },
  ]);
  const monthMap = new Map();
  for (let i = months - 1; i >= 0; i -= 1) { const key = dayjs().subtract(i, 'month').format('YYYY-MM'); monthMap.set(key, { month: dayjs(key).format('MMM'), income: 0, expenses: 0 }); }
  trend.forEach((item) => { const row = monthMap.get(item._id.month); if (row) row[item._id.type === 'expense' ? 'expenses' : 'income'] = item.total; });
  return { cashflow: [...monthMap.values()], categories: categories.map((item) => ({ name: item._id, value: item.value })) };
}
