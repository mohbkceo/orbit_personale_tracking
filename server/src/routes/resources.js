import { Router } from 'express';
import { z } from 'zod';
import { Contact, Habit, Note, Project } from '../models/Personal.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { recordProductEvent } from '../analytics/analyticsService.js';
import { EVENTS } from '../analytics/events.js';
import { requireFeature } from '../middleware/auth.js';
import { withFeatureLimit } from '../services/featureLimitService.js';
import { goalRoutes } from './planning.js';
import { Goal } from '../models/Planning.js';
import { migrateWishlist } from '../services/wishlistMigrationService.js';

const optionalDate = z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((value) => value || null);

const inputs = {
  contacts: [Contact, z.object({ name: z.string().min(1), phone: z.string().optional(), telegram: z.string().optional(), email: z.string().email().or(z.literal('')).optional(), notes: z.string().optional(), tags: z.array(z.string()).default([]) })],
  projects: [Project, z.object({ name: z.string().min(1), description: z.string().optional(), status: z.enum(['planned', 'active', 'on_hold', 'completed', 'cancelled']).default('active'), startDate: optionalDate, targetDate: optionalDate, tags: z.array(z.string()).default([]) })],
  notes: [Note, z.object({ title: z.string().min(1), content: z.string().default(''), tags: z.array(z.string()).default([]), pinned: z.boolean().default(false), archived: z.boolean().default(false) })],
  habits: [Habit, z.object({ name: z.string().min(1), frequency: z.enum(['daily', 'weekdays', 'weekly']).default('daily'), weekdays: z.array(z.number().int().min(0).max(6)).default([]), target: z.coerce.number().positive().default(1), active: z.boolean().default(true) })],
};

export const resourceRoutes = Router();
// Deprecated transport only. All writes use the Goal schema, services and collection.
resourceRoutes.use('/wishlist', requireFeature('goals'), asyncHandler(async (req, res, next) => {
  await migrateWishlist({ userId: req.user._id, dryRun: false });
  const match = req.url.match(/^\/([a-f\d]{24})(?=[/?]|$)/i);
  if (match) {
    const goal = await Goal.findOne({ user: req.user._id, 'legacyWishlist.wishlistId': match[1] }).select('_id').lean();
    if (goal) req.url = req.url.replace(match[1], String(goal._id));
  }
  if (req.body) {
    const aliases = { name: 'title', expectedPrice: 'targetAmount' };
    req.body = Object.fromEntries(Object.entries(req.body).map(([key, value]) => [aliases[key] || key, value]));
    if ('status' in req.body) req.body.status = { wanted: 'active', saving: 'active', purchased: 'completed', cancelled: 'cancelled' }[req.body.status] || req.body.status;
    if (req.method === 'POST') req.body.progressType = req.body.targetAmount == null ? 'simple' : 'money';
  }
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/goals>; rel="successor-version"');
  const send = res.json.bind(res);
  const legacyView = (goal) => goal && typeof goal === 'object' && goal.title ? {
    ...goal, name: goal.title, expectedPrice: goal.targetAmount, goalId: goal._id,
    status: { active: 'wanted', paused: 'saving', completed: 'purchased', cancelled: 'cancelled' }[goal.status] || goal.status,
  } : goal;
  res.json = (body) => send(body.success && body.data ? { ...body, data: Array.isArray(body.data) ? body.data.map(legacyView) : legacyView(body.data) } : body);
  next();
}), goalRoutes);
for (const [path, [Model, schema]] of Object.entries(inputs)) {
  resourceRoutes.use(`/${path}`, requireFeature(path));
  resourceRoutes.get(`/${path}`, asyncHandler(async (req, res) => success(res, await Model.find({ user: req.user._id }).sort({ pinned: -1, createdAt: -1 }).limit(100))));
  resourceRoutes.post(`/${path}`, validate(schema), asyncHandler(async (req, res) => { const item = path === 'projects' ? await withFeatureLimit(req.user._id, 'projects-limit', Model, {}, () => Model.create({ ...req.body, user: req.user._id })) : await Model.create({ ...req.body, user: req.user._id }); if (path === 'projects') void recordProductEvent(EVENTS.PROJECT_CREATED, `project:${item._id}`, req.user._id, req).catch(() => {}); return success(res, item, 201); }));
  resourceRoutes.patch(`/${path}/:id`, validate(schema.partial()), asyncHandler(async (req, res) => { const item = await Model.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, req.body, { new: true, runValidators: true }); if (!item) throw new AppError('Record not found', 404); return success(res, item); }));
  resourceRoutes.delete(`/${path}/:id`, asyncHandler(async (req, res) => { const item = await Model.findOneAndDelete({ _id: req.params.id, user: req.user._id }); if (!item) throw new AppError('Record not found', 404); return success(res, { deleted: true }); }));
}

resourceRoutes.post('/habits/:id/log', validate(z.object({ date: z.coerce.date().optional(), value: z.coerce.number().positive().max(1000).optional() })), asyncHandler(async (req, res) => { const habit = await Habit.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { $push: { logs: { date: req.body.date || new Date(), value: req.body.value || 1 } } }, { new: true }); if (!habit) throw new AppError('Habit not found', 404); return success(res, habit); }));
