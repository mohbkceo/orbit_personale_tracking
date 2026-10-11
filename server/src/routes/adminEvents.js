import { Router } from 'express';
import { z } from 'zod';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { DzEvent } from '../models/DzEvent.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { Reminder } from '../models/Reminder.js';
import { runDzEventSync } from '../jobs/dzEventSyncWorker.js';

export const adminEventsRoutes = Router();
adminEventsRoutes.use(adminAuth);
adminEventsRoutes.get('/', asyncHandler(async (req, res) => {
  const parsed = z.object({ search: z.string().max(120).optional(), status: z.enum(['scheduled', 'postponed', 'cancelled']).optional(), visibility: z.enum(['visible', 'featured', 'hidden']).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query);
  if (!parsed.success) throw new AppError('Invalid event filters', 400);
  const { search, status, visibility, page, limit } = parsed.data;
  const filter = { ...(search ? { title: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}), ...(status ? { scheduleStatus: status } : {}), ...(visibility ? { 'orbitVisibility.status': visibility } : {}) };
  const [items, total] = await Promise.all([DzEvent.find(filter).sort({ startsAt: 1 }).skip((page - 1) * limit).limit(limit), DzEvent.countDocuments(filter)]);
  const enriched = await Promise.all(items.map(async (item) => ({ ...item.toObject(), followers: await EventSubscription.countDocuments({ event: item._id, status: 'active' }), activeReminders: await Reminder.countDocuments({ 'metadata.integration': 'dzevent', 'metadata.externalEventId': item.externalId, status: { $in: ['scheduled', 'snoozed', 'waiting'] } }) })));
  return success(res, enriched, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
adminEventsRoutes.get('/:id', asyncHandler(async (req, res) => {
  const item = await DzEvent.findById(req.params.id).catch(() => null);
  if (!item) throw new AppError('Event not found', 404);
  return success(res, { ...item.toObject(), followers: await EventSubscription.countDocuments({ event: item._id, status: 'active' }), activeReminders: await Reminder.countDocuments({ 'metadata.externalEventId': item.externalId, 'metadata.integration': 'dzevent', status: { $in: ['scheduled', 'snoozed', 'waiting'] } }) });
}));
adminEventsRoutes.patch('/:id/visibility', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const parsed = z.object({ status: z.enum(['visible', 'featured', 'hidden']), reason: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid visibility', 400);
  const item = await DzEvent.findByIdAndUpdate(req.params.id, { $set: { orbitVisibility: { ...parsed.data, changedAt: new Date(), changedBy: req.admin._id } } }, { new: true }).catch(() => null);
  if (!item) throw new AppError('Event not found', 404);
  return success(res, item);
}));
adminEventsRoutes.post('/:id/refresh', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const item = await DzEvent.findById(req.params.id).catch(() => null);
  if (!item) throw new AppError('Event not found', 404);
  return success(res, await runDzEventSync({ force: true }));
}));
