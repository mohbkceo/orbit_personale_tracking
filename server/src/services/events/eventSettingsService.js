import { env } from '../../config/env.js';
import { EventSettings } from '../../models/EventSettings.js';
import { Setting } from '../../models/Setting.js';
import { encryptSecret, decryptSecret } from '../../utils/crypto.js';
import { AppError } from '../../utils/AppError.js';
import { fetchDzEvents } from './dzEventClient.js';

export const eventDefaults = {
  provider: { name: 'dzevent', enabled: true, keyConfiguredAt: null, lastConnectionTestAt: null, lastConnectionTestSuccess: null, lastConnectionError: null },
  integration: { enabled: true, syncEnabled: true, syncIntervalMinutes: 120, pageLimit: 100 },
  catalog: { enabled: true, allowedWilayas: [], allowedCategories: [], allowedTypes: [], allowedFormats: [] },
  discovery: { enabled: true, defaultEnabled: false, maxNotificationsPerDay: 3, minimumSpacingMinutes: 360, bundleEnabled: true, bundleWindowMinutes: 360, maxEventsPerBundle: 5, minimumLeadMinutes: 1440 },
  reminders: { enabled: true, defaultOffsetsMinutes: [1440, 120], userCanCustomize: true, maxPerEvent: 3, minOffsetMinutes: 15, maxOffsetMinutes: 43200 },
  changes: { enabled: true, startTime: true, endTime: true, venue: true, postponed: true, cancelled: true, unavailable: true, providerUrl: true, format: false, description: false, cover: false, category: false },
  delivery: { telegram: true, web: true, defaultChannels: ['telegram'] },
  quietHours: { policy: 'move_earlier', userCanOverride: true },
  userControls: { follow: true, interests: true, wilayas: true, categories: true, types: true, formats: true, discoveryToggle: true, reminderTiming: true, deliveryChannels: true, changeAlerts: true, quietHoursPolicy: true },
  limits: { maxFollowedEvents: 50, maxActiveEventReminders: 100 },
  sync: { lastSyncAt: null, lastSuccessfulSyncAt: null, lastProviderError: null, requestsToday: 0, requestDay: null, requestsHour: 0, requestHour: null, rateLimitedUntil: null, lockUntil: null },
};
const merge = (base, override = {}) => Object.fromEntries(Object.entries(base).map(([key, value]) => [key, override?.[key] === undefined ? value : override[key]]));

export async function getEventSettings() {
  const row = await EventSettings.findOne({ key: 'global' });
  return { row, value: Object.fromEntries(Object.entries(eventDefaults).map(([section, defaults]) => [section, merge(defaults, row?.[section])])) };
}

export async function getDzEventApiKey() {
  const row = await EventSettings.findOne({ key: 'global' }).select('+provider.encryptedApiKey');
  if (row?.provider?.encryptedApiKey) return { key: decryptSecret(row.provider.encryptedApiKey), source: 'database' };
  if (env.DZEVENT_API_KEY) return { key: env.DZEVENT_API_KEY, source: 'environment' };
  return { key: null, source: 'none' };
}

export async function getPublicEventSettings() {
  const { value } = await getEventSettings();
  const { source } = await getDzEventApiKey();
  if (value.sync.requestDay !== new Date().toISOString().slice(0, 10)) value.sync.requestsToday = 0;
  return { ...value, provider: { name: 'dzevent', enabled: value.provider.enabled, configured: source !== 'none', keySource: source, keyConfiguredAt: value.provider.keyConfiguredAt || null, lastConnectionTestAt: value.provider.lastConnectionTestAt || null, lastConnectionTestSuccess: value.provider.lastConnectionTestSuccess ?? null, lastConnectionError: value.provider.lastConnectionError || null } };
}

export async function updateEventSettings(input) {
  const { apiKey, ...sections } = input;
  let encryptedApiKey;
  if (apiKey?.trim()) {
    if (!/^dze_live_[A-Za-z0-9_-]{8,}$/.test(apiKey)) throw new AppError('Enter a valid DZ Event API key', 400);
    try { await fetchDzEvents({ limit: 1, page: 1 }, { apiKey, recordRequest: false }); }
    catch (error) { throw new AppError(error.publicMessage || 'Could not verify DZ Event API key', 400); }
    encryptedApiKey = encryptSecret(apiKey);
  }
  const row = await EventSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true, new: true });
  for (const [section, patch] of Object.entries(sections)) {
    if (section === 'provider') Object.assign(row.provider, patch);
    else { row[section] = { ...row[section], ...patch }; row.markModified(section); }
  }
  if (encryptedApiKey) {
    row.provider.encryptedApiKey = encryptedApiKey;
    row.provider.keyConfiguredAt = new Date();
    row.provider.lastConnectionTestAt = new Date();
    row.provider.lastConnectionTestSuccess = true;
    row.provider.lastConnectionError = null;
  }
  const effective = Object.fromEntries(Object.entries(eventDefaults).map(([section, defaults]) => [section, merge(defaults, row[section])]));
  if (effective.reminders.minOffsetMinutes > effective.reminders.maxOffsetMinutes || effective.reminders.defaultOffsetsMinutes.some((offset) => offset < effective.reminders.minOffsetMinutes || offset > effective.reminders.maxOffsetMinutes) || effective.reminders.defaultOffsetsMinutes.length > effective.reminders.maxPerEvent) throw new AppError('Default reminder offsets exceed platform limits', 400);
  if (effective.delivery.defaultChannels.some((channel) => !effective.delivery[channel])) throw new AppError('Default delivery channel is disabled', 400);
  await row.save();
  return getPublicEventSettings();
}

export async function removeDzEventApiKey() {
  await EventSettings.updateOne({ key: 'global' }, { $set: { 'provider.encryptedApiKey': null, 'provider.keyConfiguredAt': null, 'provider.lastConnectionTestSuccess': null, 'provider.lastConnectionError': null } });
  return getPublicEventSettings();
}

export async function testDzEventConnection() {
  const row = await EventSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true, new: true });
  const testedAt = new Date();
  try {
    await fetchDzEvents({ limit: 1, page: 1 });
    row.provider.lastConnectionTestAt = testedAt;
    row.provider.lastConnectionTestSuccess = true;
    row.provider.lastConnectionError = null;
    await row.save();
    return { success: true, provider: 'dzevent', message: 'Connection successful', testedAt };
  } catch (error) {
    row.provider.lastConnectionTestAt = testedAt;
    row.provider.lastConnectionTestSuccess = false;
    row.provider.lastConnectionError = error.publicMessage || 'Connection failed';
    await row.save();
    return { success: false, provider: 'dzevent', message: row.provider.lastConnectionError, testedAt };
  }
}

export function normalizeOffsets(offsets, settings) {
  const unique = [...new Set(offsets.map(Number))].sort((a, b) => b - a);
  if (!unique.length || unique.length > settings.reminders.maxPerEvent || unique.some((offset) => !Number.isInteger(offset) || offset < settings.reminders.minOffsetMinutes || offset > settings.reminders.maxOffsetMinutes)) throw new AppError('Reminder timing exceeds platform limits', 400);
  return unique;
}
export function normalizeChannels(channels, settings) {
  const unique = [...new Set(channels)];
  if (!unique.length || unique.some((channel) => !['telegram', 'web'].includes(channel) || !settings.delivery[channel])) throw new AppError('Delivery channel is unavailable', 400);
  return unique;
}

export async function getEffectiveEventSettings(userId, eventOverrides = {}) {
  const { value: admin } = await getEventSettings();
  const user = (await Setting.findOne({ user: userId }))?.events || {};
  const controls = admin.userControls;
  const userValue = (key, control, fallback) => controls[control] !== false && (!['wilayas', 'categories', 'types', 'formats'].includes(control) || controls.interests !== false) && user[key] !== undefined ? user[key] : fallback;
  const offsets = eventOverrides.reminderOffsetsMinutes ?? userValue('defaultReminderOffsetsMinutes', 'reminderTiming', admin.reminders.defaultOffsetsMinutes);
  const channels = eventOverrides.deliveryChannels ?? userValue('deliveryChannels', 'deliveryChannels', admin.delivery.defaultChannels);
  let resolvedOffsets;
  let resolvedChannels;
  try { resolvedOffsets = normalizeOffsets(offsets, admin); }
  catch (error) { if (eventOverrides.reminderOffsetsMinutes !== undefined) throw error; resolvedOffsets = normalizeOffsets(admin.reminders.defaultOffsetsMinutes, admin); }
  try { resolvedChannels = normalizeChannels(channels, admin); }
  catch (error) { if (eventOverrides.deliveryChannels !== undefined) throw error; resolvedChannels = admin.delivery.defaultChannels.filter((channel) => admin.delivery[channel]); }
  const changeAlerts = { ...admin.changes, ...(controls.changeAlerts !== false ? user.changeAlerts : {}), ...(controls.changeAlerts !== false ? eventOverrides.changeAlerts : {}) };
  for (const key of Object.keys(admin.changes)) changeAlerts[key] = Boolean(admin.changes[key] && changeAlerts[key]);
  return {
    admin,
    discoveryEnabled: admin.discovery.enabled && userValue('discoveryEnabled', 'discoveryToggle', admin.discovery.defaultEnabled),
    interests: { wilayas: userValue('wilayas', 'wilayas', []), categories: userValue('categories', 'categories', []), types: userValue('types', 'types', []), formats: userValue('formats', 'formats', []) },
    reminderOffsetsMinutes: resolvedOffsets,
    deliveryChannels: resolvedChannels,
    changeAlerts,
    quietHoursPolicy: admin.quietHours.userCanOverride && controls.quietHoursPolicy !== false ? (eventOverrides.quietHoursPolicy || user.quietHoursPolicy || admin.quietHours.policy) : admin.quietHours.policy,
  };
}
