import { z } from 'zod';

const bool = z.boolean();
const count = (min, max) => z.coerce.number().int().min(min).max(max);
const slugs = z.array(z.string().trim().regex(/^[\p{L}\p{N}-]{1,80}$/u)).max(200);
const channels = z.array(z.enum(['telegram', 'web'])).max(2);
const changes = z.object(Object.fromEntries(['enabled', 'startTime', 'endTime', 'venue', 'postponed', 'cancelled', 'unavailable', 'providerUrl', 'format', 'description', 'cover', 'category'].map((key) => [key, bool.optional()]))).strict();
export const adminEventSettingsInput = z.object({
  apiKey: z.string().trim().max(500).optional(),
  provider: z.object({ enabled: bool.optional() }).strict().optional(),
  integration: z.object({ enabled: bool.optional(), syncEnabled: bool.optional(), syncIntervalMinutes: count(15, 1440).optional(), pageLimit: count(1, 100).optional() }).strict().optional(),
  catalog: z.object({ enabled: bool.optional(), allowedWilayas: slugs.optional(), allowedCategories: slugs.optional(), allowedTypes: slugs.optional(), allowedFormats: z.array(z.enum(['physical', 'in-person', 'online'])).optional() }).strict().optional(),
  discovery: z.object({ enabled: bool.optional(), defaultEnabled: bool.optional(), maxNotificationsPerDay: count(0, 20).optional(), minimumSpacingMinutes: count(0, 1440).optional(), bundleEnabled: bool.optional(), bundleWindowMinutes: count(1, 1440).optional(), maxEventsPerBundle: count(1, 20).optional(), minimumLeadMinutes: count(0, 43200).optional() }).strict().optional(),
  reminders: z.object({ enabled: bool.optional(), defaultOffsetsMinutes: z.array(count(15, 43200)).min(1).max(10).optional(), userCanCustomize: bool.optional(), maxPerEvent: count(1, 10).optional(), minOffsetMinutes: count(1, 43200).optional(), maxOffsetMinutes: count(1, 43200).optional() }).strict().optional(),
  changes: changes.optional(),
  delivery: z.object({ telegram: bool.optional(), web: bool.optional(), defaultChannels: channels.optional() }).strict().optional(),
  quietHours: z.object({ policy: z.enum(['move_earlier', 'deliver_exact', 'skip']).optional(), userCanOverride: bool.optional() }).strict().optional(),
  userControls: z.object(Object.fromEntries(['follow', 'interests', 'wilayas', 'categories', 'types', 'formats', 'discoveryToggle', 'reminderTiming', 'deliveryChannels', 'changeAlerts', 'quietHoursPolicy'].map((key) => [key, bool.optional()]))).strict().optional(),
  limits: z.object({ maxFollowedEvents: count(1, 1000).optional(), maxActiveEventReminders: count(1, 5000).optional() }).strict().optional(),
}).strict();

export const eventPreferenceInput = z.object({
  discoveryEnabled: bool.optional(),
  wilayas: slugs.optional(), categories: slugs.optional(), types: slugs.optional(),
  formats: z.array(z.enum(['physical', 'in-person', 'online'])).optional(),
  defaultReminderOffsetsMinutes: z.array(count(1, 43200)).min(1).max(10).optional(),
  deliveryChannels: channels.optional(),
  changeAlerts: changes.optional(),
  quietHoursPolicy: z.enum(['move_earlier', 'deliver_exact', 'skip']).nullable().optional(),
}).strict();
export const eventFollowInput = eventPreferenceInput.pick({ defaultReminderOffsetsMinutes: true, deliveryChannels: true, changeAlerts: true, quietHoursPolicy: true });
