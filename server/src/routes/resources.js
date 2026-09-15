import { Router } from 'express';
import { z } from 'zod';
import { Contact, Habit, Note, Project, Wishlist } from '../models/Personal.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';

const optionalDate = z.union([z.coerce.date(), z.literal(''), z.null()]).optional().transform((value) => value || null);

const inputs = {
  contacts: [Contact, z.object({ name: z.string().min(1), phone: z.string().optional(), telegram: z.string().optional(), email: z.string().email().or(z.literal('')).optional(), notes: z.string().optional(), tags: z.array(z.string()).default([]) })],
  projects: [Project, z.object({ name: z.string().min(1), description: z.string().optional(), status: z.enum(['planned', 'active', 'on_hold', 'completed', 'cancelled']).default('active'), startDate: optionalDate, targetDate: optionalDate, tags: z.array(z.string()).default([]) })],
  notes: [Note, z.object({ title: z.string().min(1), content: z.string().default(''), tags: z.array(z.string()).default([]), pinned: z.boolean().default(false), archived: z.boolean().default(false) })],
  habits: [Habit, z.object({ name: z.string().min(1), frequency: z.enum(['daily', 'weekdays', 'weekly']).default('daily'), weekdays: z.array(z.number().int().min(0).max(6)).default([]), target: z.coerce.number().positive().default(1), active: z.boolean().default(true) })],
  wishlist: [Wishlist, z.object({ name: z.string().min(1), expectedPrice: z.coerce.number().nonnegative().optional(), priority: z.enum(['low', 'medium', 'high']).default('medium'), category: z.string().optional(), url: z.string().url().or(z.literal('')).optional(), targetDate: optionalDate, status: z.enum(['wanted', 'saving', 'purchased', 'cancelled']).default('wanted'), notes: z.string().optional() })],
};

export const resourceRoutes = Router();
for (const [path, [Model, schema]] of Object.entries(inputs)) {
  resourceRoutes.get(`/${path}`, asyncHandler(async (_req, res) => success(res, await Model.find().sort({ pinned: -1, createdAt: -1 }).limit(100))));
  resourceRoutes.post(`/${path}`, validate(schema), asyncHandler(async (req, res) => success(res, await Model.create(req.body), 201)));
  resourceRoutes.patch(`/${path}/:id`, validate(schema.partial()), asyncHandler(async (req, res) => { const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!item) throw new AppError('Record not found', 404); return success(res, item); }));
  resourceRoutes.delete(`/${path}/:id`, asyncHandler(async (req, res) => { const item = await Model.findByIdAndDelete(req.params.id); if (!item) throw new AppError('Record not found', 404); return success(res, { deleted: true }); }));
}

resourceRoutes.post('/habits/:id/log', asyncHandler(async (req, res) => { const habit = await Habit.findByIdAndUpdate(req.params.id, { $push: { logs: { date: req.body.date || new Date(), value: req.body.value || 1 } } }, { new: true }); if (!habit) throw new AppError('Habit not found', 404); return success(res, habit); }));
