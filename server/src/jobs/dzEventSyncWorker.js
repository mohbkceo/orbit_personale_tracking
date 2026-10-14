import crypto from 'node:crypto';
import { EventSettings } from '../models/EventSettings.js';
import { DzEvent } from '../models/DzEvent.js';
import { EventSubscription } from '../models/EventSubscription.js';
import { EventDiscoveryDelivery } from '../models/EventDiscoveryDelivery.js';
import { User } from '../models/User.js';
import { Reminder } from '../models/Reminder.js';
import { getEventSettings, getEffectiveEventSettings } from '../services/events/eventSettingsService.js';
import { fetchDzEvents } from '../services/events/dzEventClient.js';
import { safeEventUrl, syncSubscriptionReminders } from '../services/events/eventSubscriptionService.js';
import { checkAccess } from '../services/accessService.js';
import { canAccess } from '../services/entitlementService.js';

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const slug = (value) => typeof value === 'string' ? value.slice(0, 80) : '';
const text = (value, max = 2000) => typeof value === 'string' ? value.slice(0, max) : '';
const url = (value) => { try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; } };
export function normalizeDzEvent(raw) {
  if (!raw || raw.id === undefined || !raw.title || !raw.startsAt || Number.isNaN(new Date(raw.startsAt).getTime())) return null;
  return {
    provider: 'dzevent', externalId: String(raw.id), title: text(raw.title, 180), slug: slug(raw.slug), description: text(raw.description, 10000),
    startsAt: new Date(raw.startsAt), endsAt: raw.endsAt && !Number.isNaN(new Date(raw.endsAt).getTime()) ? new Date(raw.endsAt) : null,
    scheduleStatus: ['scheduled', 'postponed', 'cancelled'].includes(raw.scheduleStatus) ? raw.scheduleStatus : 'scheduled',
    format: slug(raw.format), venue: { name: text(raw.venueName, 250), address: text(raw.venueAddress, 500) },
    wilaya: { id: String(raw.wilaya?.id ?? ''), code: String(raw.wilaya?.code ?? ''), slug: slug(raw.wilaya?.slug), names: { fr: text(raw.wilaya?.names?.fr, 100), en: text(raw.wilaya?.names?.en, 100), ar: text(raw.wilaya?.names?.ar, 100) } },
    eventType: raw.eventType && typeof raw.eventType === 'object' ? raw.eventType : null,
    categories: Array.isArray(raw.categories) ? raw.categories.slice(0, 20) : [],
    cover: raw.cover && typeof raw.cover === 'object' ? raw.cover : null,
    website: url(raw.website), providerUrl: safeEventUrl(raw.url),
  };
}

const important = (item) => ({ startsAt: item.startsAt && new Date(item.startsAt).toISOString(), endsAt: item.endsAt && new Date(item.endsAt).toISOString(), venue: item.venue?.name || '', scheduleStatus: item.scheduleStatus, providerUrl: item.providerUrl || '', format: item.format || '' });
const snapshot = (item) => ({ ...important(item), description: item.description || '', cover: item.cover?.url || '', categories: (item.categories || []).map((category) => category.slug).sort() });
const changedFields = (before, after) => {
  const a = important(before); const b = important(after);
  const fields = [];
  if (a.startsAt !== b.startsAt) fields.push('startTime');
  if (a.endsAt !== b.endsAt) fields.push('endTime');
  if (a.venue !== b.venue) fields.push('venue');
  if (a.scheduleStatus !== b.scheduleStatus && b.scheduleStatus === 'postponed') fields.push('postponed');
  if (a.scheduleStatus !== b.scheduleStatus && b.scheduleStatus === 'cancelled') fields.push('cancelled');
  if (a.providerUrl !== b.providerUrl) fields.push('providerUrl');
  if (a.format !== b.format) fields.push('format');
  if ((before.description || '') !== (after.description || '')) fields.push('description');
  if ((before.cover?.url || '') !== (after.cover?.url || '')) fields.push('cover');
  if (JSON.stringify((before.categories || []).map((category) => category.slug).sort()) !== JSON.stringify((after.categories || []).map((category) => category.slug).sort())) fields.push('category');
  return fields;
};

async function queueNotice(userId, events, kind, message, channels, fingerprint, now, options = {}) {
  if (!events.length || !channels.length) return;
  const pending = kind === 'discovery' && options.bundleEnabled ? await Reminder.findOne({ user: userId, 'metadata.integration': 'dzevent-discovery', status: 'scheduled', nextTriggerAt: { $gt: now } }).sort({ nextTriggerAt: -1 }) : null;
  const selected = pending ? events.slice(0, Math.max(0, options.maxEventsPerBundle - (pending.metadata?.eventIds?.length || 0))) : events;
  if (!selected.length) return;
  const key = pending?.policyKey || `dzevent:${kind}:${digest([String(userId), selected.map((event) => event.externalId), fingerprint]).slice(0, 32)}`;
  const deliveryRows = [];
  for (const item of selected) {
    try { deliveryRows.push(await EventDiscoveryDelivery.create({ user: userId, event: item._id, kind, fingerprint: kind === 'discovery' ? 'initial' : fingerprint, notificationKey: key })); }
    catch (error) { if (error.code !== 11000) throw error; }
  }
  if (!deliveryRows.length) return;
  try {
    if (pending) {
      const all = [...await DzEvent.find({ _id: { $in: pending.metadata.eventIds } }), ...selected];
      pending.title = `${all.length} new events match your interests`;
      pending.message = `${all.map((item, index) => `${index + 1}. ${item.title} · ${item.wilaya?.names?.en || item.wilaya?.slug || 'Algeria'} · ${new Date(item.startsAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Algiers' })}`).join('\n')}\n\nOpen Events in Orbit to follow any event you want reminders for.`;
      pending.metadata = { ...pending.metadata, eventIds: all.map((item) => item._id), eventUrl: all.length === 1 ? safeEventUrl(all[0].providerUrl) : null };
      const usefulAt = Math.min(...all.map((item) => new Date(item.startsAt).getTime() - 15 * 60000));
      if (usefulAt < new Date(pending.nextTriggerAt).getTime()) { pending.nextTriggerAt = new Date(Math.max(now.getTime(), usefulAt)); pending.trigger.at = pending.nextTriggerAt; }
      await pending.save();
    } else {
      const usefulAt = Math.min(...selected.map((item) => new Date(item.startsAt).getTime() - 15 * 60000));
      const at = kind === 'discovery' && options.bundleEnabled ? new Date(Math.max(now.getTime(), Math.min(now.getTime() + options.bundleWindowMinutes * 60000, usefulAt))) : now;
      await Reminder.findOneAndUpdate({ user: userId, policyKey: key }, { $setOnInsert: {
        user: userId, policyKey: key, title: kind === 'discovery' ? `${selected.length} new events match your interests` : `${selected[0].title} updated`,
        message, source: 'custom', mode: 'custom', entityType: 'custom', purpose: 'act', priority: 'medium',
        trigger: { type: 'datetime', at }, nextTriggerAt: at, deliveryChannels: channels,
        metadata: { integration: kind === 'discovery' ? 'dzevent-discovery' : 'dzevent-change', eventIds: selected.map((item) => item._id), eventUrl: selected.length === 1 ? safeEventUrl(selected[0].providerUrl) : null, ...(kind === 'change' ? { changeFields: options.fields || [] } : {}) },
      } }, { upsert: true, new: true });
    }
  } catch (error) {
    await EventDiscoveryDelivery.deleteMany({ _id: { $in: deliveryRows.map((row) => row._id) } });
    throw error;
  }
}

function catalogAllows(item, catalog) {
  const allowed = (values, actual) => !values?.length || values.includes(actual);
  return allowed(catalog.allowedWilayas, item.wilaya?.slug) && allowed(catalog.allowedTypes, item.eventType?.slug) && allowed(catalog.allowedFormats, item.format) && (!catalog.allowedCategories?.length || item.categories.some((category) => catalog.allowedCategories.includes(category.slug)));
}

async function notifyChanges(item, fields, settings, now) {
  if (!settings.changes.enabled || !fields.length) return;
  const subscriptions = await EventSubscription.find({ event: item._id, status: 'active' });
  for (const subscription of subscriptions) {
    let effective;
    try { effective = await getEffectiveEventSettings(subscription.user, subscription); }
    catch { continue; }
    const enabled = fields.filter((field) => effective.changeAlerts[field]);
    if (!enabled.length) continue;
    const message = fields.includes('cancelled') ? 'DZ Event reports this event as cancelled. Check the event page before making plans.' : fields.includes('unavailable') ? 'Orbit could no longer verify this event on DZ Event. Check the event page before attending.' : `Event details changed: ${enabled.join(', ')}. Current start: ${new Date(item.startsAt).toLocaleString('en-GB', { timeZone: 'Africa/Algiers' })}.`;
    await queueNotice(subscription.user, [item], 'change', message, effective.deliveryChannels, digest([item.externalId, item.providerSnapshotHash, fields]), now, { fields });
  }
}

async function notifyDiscovery(items, settings, now) {
  if (!settings.discovery.enabled || !items.length || !settings.catalog.enabled) return;
  const users = await User.find({ status: 'ACTIVE' }).select('_id status');
  const startOfDay = new Date(now); startOfDay.setUTCHours(0, 0, 0, 0);
  for (const user of users) {
    if (!(await checkAccess(user)).eligible || !(await canAccess(user, 'events')).allowed) continue;
    let effective;
    try { effective = await getEffectiveEventSettings(user._id); } catch { continue; }
    if (!effective.discoveryEnabled) continue;
    const pending = settings.discovery.bundleEnabled ? await Reminder.findOne({ user: user._id, 'metadata.integration': 'dzevent-discovery', status: 'scheduled', nextTriggerAt: { $gt: now } }) : null;
    const prior = await EventDiscoveryDelivery.findOne({ user: user._id, kind: 'discovery' }).sort({ createdAt: -1 });
    if (!pending && prior && now.getTime() - new Date(prior.deliveredAt || prior.createdAt).getTime() < settings.discovery.minimumSpacingMinutes * 60000) continue;
    const today = await EventDiscoveryDelivery.distinct('notificationKey', { user: user._id, kind: 'discovery', createdAt: { $gte: startOfDay } });
    if (!pending && today.length >= settings.discovery.maxNotificationsPerDay) continue;
    const subscribed = new Set((await EventSubscription.find({ user: user._id, status: 'active' }).select('externalEventId')).map((item) => item.externalEventId));
    const interests = effective.interests;
    const match = items.filter((item) => !subscribed.has(item.externalId) && item.orbitVisibility?.status !== 'hidden' && new Date(item.startsAt).getTime() - now.getTime() >= settings.discovery.minimumLeadMinutes * 60000 && catalogAllows(item, settings.catalog) && (!interests.wilayas.length || interests.wilayas.includes(item.wilaya?.slug)) && (!interests.types.length || interests.types.includes(item.eventType?.slug)) && (!interests.formats.length || interests.formats.includes(item.format)) && (!interests.categories.length || item.categories.some((category) => interests.categories.includes(category.slug))));
    const unseen = [];
    for (const item of match) if (!(await EventDiscoveryDelivery.exists({ user: user._id, event: item._id, kind: 'discovery' }))) unseen.push(item);
    const slots = settings.discovery.bundleEnabled ? settings.discovery.maxEventsPerBundle - (pending?.metadata?.eventIds?.length || 0) : 1;
    const selected = unseen.slice(0, slots);
    if (!selected.length) continue;
    const lines = selected.map((item, index) => `${index + 1}. ${item.title} · ${item.wilaya?.names?.en || item.wilaya?.slug || 'Algeria'} · ${new Date(item.startsAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Algiers' })}`);
    await queueNotice(user._id, selected, 'discovery', `${lines.join('\n')}\n\nOpen Events in Orbit to follow any event you want reminders for.`, effective.deliveryChannels, 'initial', now, settings.discovery);
  }
}

export async function runDzEventSync({ force = false, now = new Date() } = {}) {
  const { value: settings } = await getEventSettings();
  if (!settings.provider.enabled || !settings.integration.enabled || !settings.integration.syncEnabled) return { skipped: 'disabled' };
  if (settings.sync.rateLimitedUntil && new Date(settings.sync.rateLimitedUntil) > now) return { skipped: 'rate_limited' };
  if (settings.sync.lastSyncAt && now.getTime() - new Date(settings.sync.lastSyncAt).getTime() < (force ? 5 : settings.integration.syncIntervalMinutes) * 60000) return { skipped: 'not_due' };
  await EventSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true });
  const claimed = await EventSettings.findOneAndUpdate({ key: 'global', $or: [{ 'sync.lockUntil': { $lte: now } }, { 'sync.lockUntil': { $exists: false } }, { 'sync.lockUntil': null }] }, { $set: { 'sync.lockUntil': new Date(now.getTime() + 10 * 60000), 'sync.lastSyncAt': now } }, { new: true });
  if (!claimed) return { skipped: 'in_progress' };
  try {
    const seen = new Set(); let page = 1; let complete = false; let changes = 0;
    while (page <= 20) {
      const result = await fetchDzEvents({ page, limit: settings.integration.pageLimit });
      for (const raw of result.data) {
        const normalized = normalizeDzEvent(raw); if (!normalized) continue;
        seen.add(normalized.externalId);
        const before = await DzEvent.findOne({ provider: 'dzevent', externalId: normalized.externalId });
        const hash = digest(snapshot(normalized));
        const item = await DzEvent.findOneAndUpdate({ provider: 'dzevent', externalId: normalized.externalId }, { $set: { ...normalized, providerSnapshotHash: hash, lastSeenAt: now, lastSyncedAt: now, consecutiveMissingSyncs: 0, verificationStatus: 'verified' }, $setOnInsert: { 'orbitVisibility.status': 'visible' } }, { upsert: true, new: true });
        if (before) {
          const fields = changedFields(before, normalized);
          if (fields.length || before.verificationStatus === 'unavailable') {
            changes += 1;
            const subscriptions = await EventSubscription.find({ event: item._id, status: 'active' });
            if (before.verificationStatus === 'unavailable' || fields.some((field) => ['startTime', 'venue', 'cancelled', 'postponed'].includes(field))) for (const sub of subscriptions) await syncSubscriptionReminders(sub, item, { now });
            await notifyChanges(item, fields, settings, now);
          }
        }
      }
      if (!result.pagination.hasNextPage && (!result.pagination.totalPages || page >= result.pagination.totalPages) || result.data.length < settings.integration.pageLimit) { complete = true; break; }
      page += 1;
    }
    if (complete) {
      const missing = await DzEvent.find({ provider: 'dzevent', externalId: { $nin: [...seen] }, startsAt: { $gt: now }, verificationStatus: 'verified' });
      for (const item of missing) {
        item.consecutiveMissingSyncs += 1;
        if (item.consecutiveMissingSyncs >= 3) { item.verificationStatus = 'unavailable'; await item.save(); for (const sub of await EventSubscription.find({ event: item._id, status: 'active' })) await syncSubscriptionReminders(sub, item, { now }); await notifyChanges(item, ['unavailable'], settings, now); }
        else await item.save();
      }
    }
    const discoverable = await DzEvent.find({ provider: 'dzevent', startsAt: { $gt: now }, verificationStatus: 'verified' }).sort({ startsAt: 1 }).limit(500);
    await notifyDiscovery(discoverable, settings, now);
    await EventSettings.updateOne({ key: 'global' }, { $set: { 'sync.lastSuccessfulSyncAt': now, 'sync.lastProviderError': null, 'sync.lockUntil': null } });
    return { synced: seen.size, pages: page, complete, changes };
  } catch (error) {
    await EventSettings.updateOne({ key: 'global' }, { $set: { 'sync.lastProviderError': error.publicMessage || 'Synchronization failed', 'sync.lockUntil': null } });
    throw error;
  }
}
