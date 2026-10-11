import { Router } from 'express';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminEventSettingsInput } from '../validators/eventSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getPublicEventSettings, updateEventSettings, removeDzEventApiKey, testDzEventConnection } from '../services/events/eventSettingsService.js';
import { runDzEventSync } from '../jobs/dzEventSyncWorker.js';
import { DzEvent } from '../models/DzEvent.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { EventDiscoveryDelivery } from '../models/EventDiscoveryDelivery.js';
import { Reminder } from '../models/Reminder.js';

export const adminEventSettingsRoutes = Router();
adminEventSettingsRoutes.use(adminAuth);
adminEventSettingsRoutes.get('/', asyncHandler(async (_req, res) => success(res, await getPublicEventSettings())));
adminEventSettingsRoutes.put('/', adminRoleGuard('SUPER_ADMIN'), validate(adminEventSettingsInput), asyncHandler(async (req, res) => success(res, await updateEventSettings(req.body))));
adminEventSettingsRoutes.post('/test', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => success(res, await testDzEventConnection())));
adminEventSettingsRoutes.delete('/api-key', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => success(res, await removeDzEventApiKey())));
adminEventSettingsRoutes.post('/sync', adminRoleGuard('SUPER_ADMIN'), asyncHandler(async (_req, res) => success(res, await runDzEventSync({ force: true }))));
adminEventSettingsRoutes.get('/metrics', asyncHandler(async (_req, res) => {
  const [cachedEvents, visibleEvents, followedEvents, uniqueFollowers, activeEventReminders, discoveryNotificationKeys, deliveredRows, categories, wilayas] = await Promise.all([
    DzEvent.countDocuments(), DzEvent.countDocuments({ 'orbitVisibility.status': { $ne: 'hidden' } }), EventSubscription.countDocuments({ status: 'active' }), EventSubscription.distinct('user', { status: 'active' }), Reminder.countDocuments({ 'metadata.integration': 'dzevent', status: { $in: ['scheduled', 'snoozed', 'waiting'] } }), EventDiscoveryDelivery.distinct('notificationKey', { kind: 'discovery', deliveredAt: { $ne: null } }),
    Reminder.countDocuments({ 'metadata.integration': 'dzevent', deliveredAt: { $ne: null } }),
    EventSubscription.aggregate([{ $match: { status: 'active' } }, { $lookup: { from: 'dzevents', localField: 'event', foreignField: '_id', as: 'eventData' } }, { $unwind: '$eventData' }, { $unwind: '$eventData.categories' }, { $group: { _id: '$eventData.categories.slug', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
    EventSubscription.aggregate([{ $match: { status: 'active' } }, { $lookup: { from: 'dzevents', localField: 'event', foreignField: '_id', as: 'eventData' } }, { $unwind: '$eventData' }, { $group: { _id: '$eventData.wilaya.slug', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
  ]);
  return success(res, { cachedEvents, visibleEvents, followedEvents, uniqueFollowers: uniqueFollowers.length, activeEventReminders, remindersDelivered: deliveredRows, discoveryNotificationsDelivered: discoveryNotificationKeys.length, mostFollowedCategories: categories, mostFollowedWilayas: wilayas });
}));
