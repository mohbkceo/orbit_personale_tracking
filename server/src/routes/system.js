import { Router } from 'express';
import { Account } from '../models/Account.js';
import { Debt } from '../models/Debt.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { Contact, Habit, Note, Project, Wishlist } from '../models/Personal.js';
import { Activity } from '../models/Activity.js';
import { Setting } from '../models/Setting.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { escapeRegex } from '../utils/query.js';

export const systemRoutes = Router();
systemRoutes.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100); if (q.length < 2) return success(res, []);
  const rx = new RegExp(escapeRegex(q), 'i');
  const user = req.user._id;
  const requests = [
    ['task', Task.find({ user, archived: false, title: rx }).limit(5).lean()], ['transaction', Transaction.find({ user, deletedAt: null, description: rx }).limit(5).lean()],
    ['debt', Debt.find({ user, archived: false, personName: rx }).limit(5).lean()], ['contact', Contact.find({ user, name: rx }).limit(5).lean()],
    ['note', Note.find({ user, archived: false, $or: [{ title: rx }, { content: rx }] }).limit(5).lean()], ['project', Project.find({ user, name: rx }).limit(5).lean()],
    ['subscription', Subscription.find({ user, name: rx }).limit(5).lean()], ['goal', Goal.find({ user, title: rx }).limit(5).lean()],
  ];
  const groups = await Promise.all(requests.map(([, promise]) => promise));
  return success(res, groups.flatMap((items, index) => items.map((item) => ({ ...item, resultType: requests[index][0], label: item.title || item.name || item.personName || item.description }))));
}));

systemRoutes.get('/export/:resource', asyncHandler(async (req, res) => {
  const models = { accounts: Account, transactions: Transaction, debts: Debt, tasks: Task, goals: Goal, bills: Bill, subscriptions: Subscription, contacts: Contact, projects: Project, notes: Note, habits: Habit, wishlist: Wishlist, activity: Activity, settings: Setting };
  if (req.params.resource === 'all') {
    const data = Object.fromEntries(await Promise.all(Object.entries(models).map(async ([name, Model]) => [name, await Model.find({ user: req.user._id }).lean()])));
    res.setHeader('Content-Disposition', `attachment; filename="orbit-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.json({ exportedAt: new Date(), version: 1, data });
  }
  const Model = models[req.params.resource]; if (!Model) return res.status(404).json({ success: false, message: 'Export resource not found' });
  const rows = await Model.find({ user: req.user._id }).lean();
  if (req.query.format === 'csv') {
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !['__v'].includes(key))))];
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [keys.join(','), ...rows.map((row) => keys.map((key) => escape(typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${req.params.resource}.csv"`); return res.send(csv);
  }
  return success(res, rows);
}));
