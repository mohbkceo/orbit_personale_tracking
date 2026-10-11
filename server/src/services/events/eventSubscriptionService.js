import { DzEvent } from '../../models/DzEvent.js';
import { EventSubscription } from '../../models/EventSubscription.js';
import { Reminder } from '../../models/Reminder.js';
import { event as reminderEvent } from '../reminders/reminderService.js';
import { getSettingsDocument } from '../settingsService.js';
import { getEffectiveEventSettings, getEventSettings } from './eventSettingsService.js';
import { inQuietHours, nextActiveTime } from '../reminders/reminderTime.js';
import { AppError } from '../../utils/AppError.js';

const active = ['scheduled', 'snoozed', 'waiting'];
export function safeEventUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['dzevent.com', 'www.dzevent.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function eventReminderAt(startsAt, offsetMinutes, settings, policy) {
  const date = new Date(new Date(startsAt).getTime() - offsetMinutes * 60000);
  if (!Number.isFinite(date.getTime())) throw new AppError('Invalid event start time', 400);
  if (policy === 'deliver_exact') return date;
  if (policy === 'skip' && (inQuietHours(date, settings) || nextActiveTime(date, settings) > date)) return null;
  if (policy === 'move_earlier') {
    for (let minute = 0; minute < 2880; minute += 1) {
      if (!inQuietHours(date, settings) && nextActiveTime(date, settings) <= date) return date;
      date.setTime(date.getTime() - 60000);
    }
    return null;
  }
  return date;
}

function eventMessage(item, settings, offset) {
  const time = new Intl.DateTimeFormat('en', { timeZone: settings.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.startsAt));
  const lead = offset % 1440 === 0 ? `${offset / 1440} day${offset === 1440 ? '' : 's'}` : offset % 60 === 0 ? `${offset / 60} hour${offset === 60 ? '' : 's'}` : `${offset} minutes`;
  return `${lead} until this event · ${time}${item.venue?.name ? ` · 📍 ${item.venue.name}` : ''}`;
}

export async function syncSubscriptionReminders(subscription, item, { now = new Date() } = {}) {
  let effective;
  const { value: hard } = await getEventSettings();
  const allowedOffsets = (subscription.reminderOffsetsMinutes || []).filter((offset) => offset >= hard.reminders.minOffsetMinutes && offset <= hard.reminders.maxOffsetMinutes).slice(0, hard.reminders.maxPerEvent);
  const allowedChannels = (subscription.deliveryChannels || []).filter((channel) => hard.delivery[channel]);
  try { effective = await getEffectiveEventSettings(subscription.user, { reminderOffsetsMinutes: allowedOffsets, deliveryChannels: allowedChannels, changeAlerts: subscription.changeAlerts, quietHoursPolicy: subscription.quietHoursPolicy }); }
  catch (error) {
    if (error.status !== 400) throw error;
    await Reminder.updateMany({ user: subscription.user, 'metadata.eventSubscriptionId': subscription._id, status: { $in: active } }, { $set: { status: 'suppressed', claimUntil: null } });
    return [];
  }
  const settings = await getSettingsDocument(subscription.user);
  const offsets = effective.reminderOffsetsMinutes.slice(0, effective.admin.reminders.maxPerEvent);
  const keys = offsets.map((offset) => `dzevent:${subscription.externalEventId}:${offset}`);
  await Reminder.updateMany({ user: subscription.user, 'metadata.integration': 'dzevent', 'metadata.eventSubscriptionId': subscription._id, status: { $in: active }, policyKey: { $nin: keys } }, { $set: { status: 'cancelled', claimUntil: null } });
  if (item.scheduleStatus === 'cancelled' || item.scheduleStatus === 'postponed' || item.verificationStatus === 'unavailable') {
    await Reminder.updateMany({ user: subscription.user, 'metadata.eventSubscriptionId': subscription._id, status: { $in: active } }, { $set: { status: item.scheduleStatus === 'cancelled' ? 'cancelled' : 'suppressed', claimUntil: null } });
    return [];
  }
  const ids = [];
  for (const offset of offsets) {
    const policyKey = `dzevent:${subscription.externalEventId}:${offset}`;
    const at = eventReminderAt(item.startsAt, offset, settings, effective.quietHoursPolicy);
    const previous = await Reminder.findOne({ user: subscription.user, policyKey });
    if (!at || at <= now || new Date(item.startsAt) <= now) {
      if (previous && active.includes(previous.status)) { previous.status = 'expired'; previous.claimUntil = null; await previous.save(); }
      continue;
    }
    const data = {
      title: item.title, message: eventMessage(item, settings, offset), source: 'custom', mode: 'custom', entityType: 'custom', purpose: 'prepare', priority: 'medium',
      trigger: { type: 'datetime', at, timezone: settings.timezone }, nextTriggerAt: at,
      deliveryChannels: effective.deliveryChannels,
      metadata: { integration: 'dzevent', provider: 'dzevent', externalEventId: subscription.externalEventId, eventSubscriptionId: subscription._id, offsetMinutes: offset, eventStartsAt: item.startsAt, eventEndsAt: item.endsAt, eventUrl: safeEventUrl(item.providerUrl), venueName: item.venue?.name, scheduleStatus: item.scheduleStatus, quietHoursPolicy: effective.quietHoursPolicy },
    };
    if (previous) {
      if (['completed', 'active'].includes(previous.status)) { ids.push(previous._id); continue; }
      if (previous.status === 'snoozed' && new Date(previous.nextTriggerAt) < new Date(item.startsAt)) { ids.push(previous._id); continue; }
      Object.assign(previous, data, { status: 'scheduled', claimUntil: null, processingBy: null });
      await previous.save();
      await reminderEvent(previous, 'rescheduled');
      ids.push(previous._id);
    } else {
      try {
        const created = await Reminder.create({ user: subscription.user, policyKey, ...data });
        await reminderEvent(created, 'generated');
        ids.push(created._id);
      } catch (error) {
        if (error.code !== 11000) throw error;
        const found = await Reminder.findOne({ user: subscription.user, policyKey });
        if (found) ids.push(found._id);
      }
    }
  }
  subscription.reminderIds = ids;
  await subscription.save();
  return ids;
}

export async function followEvent(userId, externalId, overrides = {}) {
  const item = await DzEvent.findOne({ provider: 'dzevent', externalId, 'orbitVisibility.status': { $ne: 'hidden' } });
  if (!item) throw new AppError('Event not found', 404);
  if (new Date(item.startsAt) <= new Date()) throw new AppError('This event has already started', 409);
  const effective = await getEffectiveEventSettings(userId, { reminderOffsetsMinutes: overrides.defaultReminderOffsetsMinutes, deliveryChannels: overrides.deliveryChannels, changeAlerts: overrides.changeAlerts, quietHoursPolicy: overrides.quietHoursPolicy });
  if (!effective.admin.integration.enabled || !effective.admin.reminders.enabled || effective.admin.userControls.follow === false) throw new AppError('Following events is disabled', 403);
  if (!effective.deliveryChannels.length) throw new AppError('No event delivery channel is available', 409);
  const catalog = effective.admin.catalog;
  if (!catalog.enabled || catalog.allowedWilayas.length && !catalog.allowedWilayas.includes(item.wilaya?.slug) || catalog.allowedTypes.length && !catalog.allowedTypes.includes(item.eventType?.slug) || catalog.allowedFormats.length && !catalog.allowedFormats.includes(item.format) || catalog.allowedCategories.length && !item.categories.some((category) => catalog.allowedCategories.includes(category.slug))) throw new AppError('Event is outside the allowed catalog', 403);
  if (item.scheduleStatus === 'cancelled') throw new AppError('This event is cancelled', 409);
  if ('defaultReminderOffsetsMinutes' in overrides && (!effective.admin.reminders.userCanCustomize || effective.admin.userControls.reminderTiming === false) || 'deliveryChannels' in overrides && effective.admin.userControls.deliveryChannels === false || 'changeAlerts' in overrides && effective.admin.userControls.changeAlerts === false || 'quietHoursPolicy' in overrides && (!effective.admin.quietHours.userCanOverride || effective.admin.userControls.quietHoursPolicy === false)) throw new AppError('Event customization is disabled', 403);
  const count = await EventSubscription.countDocuments({ user: userId, status: 'active' });
  const existing = await EventSubscription.findOne({ user: userId, provider: 'dzevent', externalEventId: externalId });
  if (existing?.status === 'active') { await syncSubscriptionReminders(existing, item); return existing; }
  if (count >= effective.admin.limits.maxFollowedEvents) throw new AppError('Followed event limit reached', 409);
  const reminderCount = await Reminder.countDocuments({ user: userId, 'metadata.integration': 'dzevent', status: { $in: active } });
  if (reminderCount + effective.reminderOffsetsMinutes.length > effective.admin.limits.maxActiveEventReminders) throw new AppError('Active event reminder limit reached', 409);
  const data = { user: userId, event: item._id, provider: 'dzevent', externalEventId: externalId, status: 'active', reminderOffsetsMinutes: effective.reminderOffsetsMinutes, deliveryChannels: effective.deliveryChannels, changeAlerts: effective.changeAlerts, quietHoursPolicy: effective.quietHoursPolicy, followedAt: new Date(), unfollowedAt: null };
  let subscription;
  try { subscription = await EventSubscription.findOneAndUpdate({ user: userId, provider: 'dzevent', externalEventId: externalId }, { $set: data }, { upsert: true, new: true }); }
  catch (error) { if (error.code !== 11000) throw error; subscription = await EventSubscription.findOne({ user: userId, provider: 'dzevent', externalEventId: externalId }); }
  await syncSubscriptionReminders(subscription, item);
  return subscription;
}

export async function updateFollow(userId, externalId, overrides) {
  const subscription = await EventSubscription.findOne({ user: userId, provider: 'dzevent', externalEventId: externalId, status: 'active' });
  if (!subscription) throw new AppError('Followed event not found', 404);
  const effective = await getEffectiveEventSettings(userId, { reminderOffsetsMinutes: overrides.defaultReminderOffsetsMinutes ?? subscription.reminderOffsetsMinutes, deliveryChannels: overrides.deliveryChannels ?? subscription.deliveryChannels, changeAlerts: overrides.changeAlerts ?? subscription.changeAlerts, quietHoursPolicy: overrides.quietHoursPolicy ?? subscription.quietHoursPolicy });
  if ('defaultReminderOffsetsMinutes' in overrides && (!effective.admin.reminders.userCanCustomize || effective.admin.userControls.reminderTiming === false) || 'deliveryChannels' in overrides && effective.admin.userControls.deliveryChannels === false || 'changeAlerts' in overrides && effective.admin.userControls.changeAlerts === false || 'quietHoursPolicy' in overrides && (!effective.admin.quietHours.userCanOverride || effective.admin.userControls.quietHoursPolicy === false)) throw new AppError('This customization is disabled', 403);
  if ('defaultReminderOffsetsMinutes' in overrides) {
    const [currentCount, otherCount] = await Promise.all([
      Reminder.countDocuments({ user: userId, 'metadata.eventSubscriptionId': subscription._id, status: { $in: active } }),
      Reminder.countDocuments({ user: userId, 'metadata.integration': 'dzevent', 'metadata.eventSubscriptionId': { $ne: subscription._id }, status: { $in: active } }),
    ]);
    if (effective.reminderOffsetsMinutes.length > currentCount && otherCount + effective.reminderOffsetsMinutes.length > effective.admin.limits.maxActiveEventReminders) {
      throw new AppError('Active event reminder limit reached', 409);
    }
  }
  const item = await DzEvent.findById(subscription.event);
  if (!item) throw new AppError('Event not found', 404);
  subscription.reminderOffsetsMinutes = effective.reminderOffsetsMinutes;
  subscription.deliveryChannels = effective.deliveryChannels;
  subscription.changeAlerts = effective.changeAlerts;
  subscription.quietHoursPolicy = effective.quietHoursPolicy;
  await subscription.save();
  await syncSubscriptionReminders(subscription, item);
  return subscription;
}

export async function unfollowEvent(userId, externalId) {
  const subscription = await EventSubscription.findOne({ user: userId, provider: 'dzevent', externalEventId: externalId, status: 'active' });
  if (!subscription) throw new AppError('Followed event not found', 404);
  subscription.status = 'unfollowed'; subscription.unfollowedAt = new Date(); await subscription.save();
  await Reminder.updateMany({ user: userId, 'metadata.eventSubscriptionId': subscription._id, status: { $in: active } }, { $set: { status: 'cancelled', claimUntil: null } });
  return subscription;
}
