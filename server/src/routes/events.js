import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { DzEvent } from '../models/DzEvent.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { Setting } from '../models/Setting.js';
import { getEventSettings, getEffectiveEventSettings } from '../services/events/eventSettingsService.js';
import { eventPreferenceInput, eventFollowInput } from '../validators/eventSettings.js';
import { followEvent, updateFollow, unfollowEvent } from '../services/events/eventSubscriptionService.js';

export const eventRoutes = Router();
const externalId = z.object({ externalId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) });
eventRoutes.get('/', asyncHandler(async (req, res) => {
  const parsed = z.object({ wilaya: z.string().max(80).optional(), category: z.string().max(80).optional(), type: z.string().max(80).optional(), format: z.string().max(80).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query);
  if (!parsed.success) throw new AppError('Invalid event filters', 400);
  const { value: settings } = await getEventSettings();
  if (!settings.integration.enabled || !settings.catalog.enabled) throw new AppError('Event catalog is unavailable', 503);
  const { page, limit, wilaya, category, type, format } = parsed.data;
  const permitted = (list, value) => !value || !list.length || list.includes(value);
  if (!permitted(settings.catalog.allowedWilayas, wilaya) || !permitted(settings.catalog.allowedCategories, category) || !permitted(settings.catalog.allowedTypes, type) || !permitted(settings.catalog.allowedFormats, format)) throw new AppError('Filter is outside the allowed catalog', 400);
  const filter = { provider: 'dzevent', 'orbitVisibility.status': { $ne: 'hidden' }, startsAt: { $gt: new Date() }, scheduleStatus: { $ne: 'cancelled' }, ...(wilaya ? { 'wilaya.slug': wilaya } : {}), ...(category ? { 'categories.slug': category } : {}), ...(type ? { 'eventType.slug': type } : {}), ...(format ? { format } : {}) };
  for (const [path, allowed] of [['wilaya.slug', settings.catalog.allowedWilayas], ['categories.slug', settings.catalog.allowedCategories], ['eventType.slug', settings.catalog.allowedTypes], ['format', settings.catalog.allowedFormats]]) if (allowed.length) filter[path] = filter[path] ? { $in: [filter[path]].flat().filter((value) => allowed.includes(value)) } : { $in: allowed };
  const [items, total, follows] = await Promise.all([DzEvent.find(filter).sort({ 'orbitVisibility.status': 1, startsAt: 1 }).skip((page - 1) * limit).limit(limit), DzEvent.countDocuments(filter), EventSubscription.find({ user: req.user._id, status: 'active' }).select('externalEventId')]);
  const followed = new Set(follows.map((row) => row.externalEventId));
  return success(res, items.map((item) => ({ ...item.toObject(), following: followed.has(item.externalId) })), 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
eventRoutes.get('/following', asyncHandler(async (req, res) => success(res, await EventSubscription.find({ user: req.user._id, status: 'active' }).populate('event').sort({ followedAt: -1 }))));
eventRoutes.get('/preferences', asyncHandler(async (req, res) => {
  const setting = await Setting.findOne({ user: req.user._id });
  const effective = await getEffectiveEventSettings(req.user._id);
  return success(res, { overrides: setting?.events || {}, effective });
}));
eventRoutes.patch('/preferences', validate(eventPreferenceInput), asyncHandler(async (req, res) => {
  const { value: admin } = await getEventSettings();
  for (const [field, control] of Object.entries({ discoveryEnabled: 'discoveryToggle', wilayas: 'wilayas', categories: 'categories', types: 'types', formats: 'formats', defaultReminderOffsetsMinutes: 'reminderTiming', deliveryChannels: 'deliveryChannels', changeAlerts: 'changeAlerts', quietHoursPolicy: 'quietHoursPolicy' })) if (field in req.body && admin.userControls[control] === false) throw new AppError(`${field} cannot be customized`, 403);
  if (admin.userControls.interests === false && ['wilayas', 'categories', 'types', 'formats'].some((field) => field in req.body)) throw new AppError('Event interests cannot be customized', 403);
  if ('defaultReminderOffsetsMinutes' in req.body && !admin.reminders.userCanCustomize) throw new AppError('Reminder timing cannot be customized', 403);
  if ('quietHoursPolicy' in req.body && !admin.quietHours.userCanOverride) throw new AppError('Quiet hours policy cannot be customized', 403);
  const setting = await Setting.findOneAndUpdate({ user: req.user._id }, { $setOnInsert: { user: req.user._id } }, { upsert: true, new: true });
  setting.events = { ...setting.events, ...req.body }; setting.markModified('events');
  await getEffectiveEventSettings(req.user._id, { reminderOffsetsMinutes: setting.events.defaultReminderOffsetsMinutes, deliveryChannels: setting.events.deliveryChannels, quietHoursPolicy: setting.events.quietHoursPolicy });
  await setting.save();
  return success(res, { overrides: setting.events, effective: await getEffectiveEventSettings(req.user._id) });
}));
eventRoutes.get('/:externalId', validate(externalId, 'params'), asyncHandler(async (req, res) => {
  const item = await DzEvent.findOne({ provider: 'dzevent', externalId: req.params.externalId, 'orbitVisibility.status': { $ne: 'hidden' } });
  if (!item) throw new AppError('Event not found', 404);
  return success(res, item);
}));
eventRoutes.post('/:externalId/follow', validate(externalId, 'params'), validate(eventFollowInput), asyncHandler(async (req, res) => success(res, await followEvent(req.user._id, req.params.externalId, req.body), 201)));
eventRoutes.patch('/:externalId/follow', validate(externalId, 'params'), validate(eventFollowInput), asyncHandler(async (req, res) => success(res, await updateFollow(req.user._id, req.params.externalId, req.body))));
eventRoutes.delete('/:externalId/follow', validate(externalId, 'params'), asyncHandler(async (req, res) => success(res, await unfollowEvent(req.user._id, req.params.externalId))));
