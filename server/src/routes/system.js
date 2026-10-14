import { Router } from 'express';
import { Account } from '../models/Account.js';
import { Debt } from '../models/Debt.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { Contact, Habit, Note, Project, Wishlist } from '../models/Personal.js';
import { Activity } from '../models/Activity.js';
import { Setting } from '../models/Setting.js';
import { Task } from '../models/Task.js';
import { Transaction, TRANSACTION_TYPES } from '../models/Transaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { escapeRegex } from '../utils/query.js';
import { requireFeature } from '../middleware/auth.js';

export const systemRoutes = Router();
const visibleTransactionTypes = (decisions) => TRANSACTION_TYPES.filter((type) => type !== 'income' && type !== 'expense' || decisions[type === 'income' ? 'income' : 'expenses']?.allowed);
systemRoutes.get('/search', requireFeature('quick-access'), asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100); if (q.length < 2) return success(res, []);
  const rx = new RegExp(escapeRegex(q), 'i');
  const user = req.user._id;
  const requests = [
    ['task', Task.find({ user, archived: false, title: rx }).limit(5).lean()], ['transaction', Transaction.find({ user, deletedAt: null, description: rx, type: { $in: visibleTransactionTypes(req.entitlements.decisions) } }).limit(5).lean()],
    ['debt', Debt.find({ user, archived: false, personName: rx }).limit(5).lean()], ['contact', Contact.find({ user, name: rx }).limit(5).lean()],
    ['note', Note.find({ user, archived: false, $or: [{ title: rx }, { content: rx }] }).limit(5).lean()], ['project', Project.find({ user, name: rx }).limit(5).lean()],
    ['subscription', Subscription.find({ user, name: rx }).limit(5).lean()], ['goal', Goal.find({ user, title: rx }).limit(5).lean()],
  ];
  const section = { task: 'tasks', transaction: 'transactions', debt: 'debts', contact: 'contacts', note: 'notes', project: 'projects', subscription: 'subscriptions', goal: 'goals' };
  const permitted = requests.filter(([type]) => req.entitlements.decisions[section[type]]?.allowed);
  const groups = await Promise.all(permitted.map(([, promise]) => promise));
  return success(res, groups.flatMap((items, index) => items.map((item) => ({ ...item, resultType: permitted[index][0], label: item.title || item.name || item.personName || item.description }))));
}));

systemRoutes.get('/export/:resource', requireFeature('export-data'), asyncHandler(async (req, res) => {
  const models = { accounts: Account, transactions: Transaction, debts: Debt, tasks: Task, goals: Goal, bills: Bill, subscriptions: Subscription, contacts: Contact, projects: Project, notes: Note, habits: Habit, wishlist: Wishlist, activity: Activity, settings: Setting };
  const filter = (name) => ({ user: req.user._id, ...(name === 'transactions' ? { type: { $in: visibleTransactionTypes(req.entitlements.decisions) } } : {}) });
  const allowed = (name) => name === 'activity' || name === 'settings' || req.entitlements.decisions[name]?.allowed;
  if (req.params.resource === 'all') {
    const data = Object.fromEntries(await Promise.all(Object.entries(models).filter(([name]) => allowed(name)).map(async ([name, Model]) => [name, await Model.find(filter(name)).lean()])));
    res.setHeader('Content-Disposition', `attachment; filename="orbit-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.json({ exportedAt: new Date(), version: 1, data });
  }
  const Model = models[req.params.resource]; if (!Model) return res.status(404).json({ success: false, message: 'Export resource not found' });
  if (!allowed(req.params.resource)) return res.status(403).json({ success: false, code: 'FEATURE_NOT_INCLUDED', message: 'This export is not included in your current plan.', feature: req.params.resource });
  const rows = await Model.find(filter(req.params.resource)).lean();
  if (req.query.format === 'csv') {
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !['__v'].includes(key))))];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [keys.join(','), ...rows.map((row) => keys.map((key) => escape(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.resource}.csv"`); return res.send(csv);
  }
  return success(res, rows);
}));
