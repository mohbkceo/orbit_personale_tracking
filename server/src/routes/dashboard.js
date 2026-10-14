import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { dashboardCharts, dashboardSummary } from '../services/dashboardService.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/summary', asyncHandler(async (req, res) => {
  const data = await dashboardSummary(req.user._id);
  const allowed = (key) => req.entitlements.decisions[key]?.allowed;
  if (!allowed('accounts')) { data.accounts = []; data.money.totalBalance = 0; }
  if (!allowed('income')) data.money.income = 0;
  if (!allowed('expenses')) data.money.expenses = 0;
  data.money.net = data.money.income - data.money.expenses;
  if (!allowed('debts')) data.debts = { receivable: 0, payable: 0 };
  if (!allowed('tasks')) data.tasks = { open: 0, overdue: 0, dueToday: 0 };
  if (!allowed('transactions')) data.recentTransactions = [];
  else data.recentTransactions = data.recentTransactions.filter((row) => row.type !== 'income' && row.type !== 'expense' || allowed(row.type === 'income' ? 'income' : 'expenses'));
  data.upcoming = data.upcoming.filter((row) => allowed(row.kind === 'bill' ? 'bills' : 'subscriptions'));
  if (!allowed('goals')) data.goals = [];
  const entity = { Task: 'tasks', Account: 'accounts', Transaction: 'transactions', Debt: 'debts', Bill: 'bills', Subscription: 'subscriptions', Goal: 'goals', Project: 'projects', Habit: 'habits', Note: 'notes', Contact: 'contacts', Wishlist: 'wishlist' };
  data.activity = data.activity.filter((row) => !entity[row.entityType] || allowed(entity[row.entityType]));
  return success(res, data);
}));
dashboardRoutes.get('/charts', asyncHandler(async (req, res) => {
  const data = await dashboardCharts(req.user._id, Math.min(Number(req.query.months) || 6, 24));
  if (!req.entitlements.decisions.income?.allowed) data.cashflow.forEach((row) => { row.income = 0; });
  if (!req.entitlements.decisions.expenses?.allowed) { data.cashflow.forEach((row) => { row.expenses = 0; }); data.categories = []; }
  return success(res, data);
}));
