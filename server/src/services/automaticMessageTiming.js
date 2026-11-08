import { z } from 'zod';
import { AppError } from '../utils/AppError.js';
import { AutomationSettings } from '../models/AutomationSettings.js';
import { EventSettings } from '../models/EventSettings.js';
import { getAutomationSettings } from './automationSettings.service.js';
import { getEventSettings, normalizeOffsets } from './events/eventSettingsService.js';
import { automationSettingsInput } from '../validators/automationSettings.js';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const fields = {
  'task-digest': [{ field: 'times', label: 'Delivery times', type: 'times' }],
  'focus-morning': [{ field: 'morningTime', label: 'Morning reminder', type: 'time' }],
  'focus-evening': [{ field: 'eveningTime', label: 'Evening review', type: 'time' }],
  'focus-followup': [{ field: 'planningReminderIntervalMinutes', label: 'Remind again after (minutes)', type: 'number', min: 15, max: 1440 }],
  'event-followed': [{ field: 'defaultOffsetsMinutes', label: 'Before the event (hours)', type: 'offsets' }],
};
export function automaticTimingFields(key, value) {
  return (fields[key] || []).map((item) => ({ ...item, value: value?.[item.field] }));
}

// Only scheduler-owned, supported fields can be changed from the simple editor.
// Keep updates narrow: unrelated worker policies and user schedules are untouched.
export async function prepareAutomaticTiming(key, timing) {
  if (timing === undefined) return null;
  const allowed = fields[key] || [];
  const schema = z.strictObject(Object.fromEntries(allowed.map((item) => [item.field, item.type === 'time' ? clock : item.type === 'times' ? z.array(clock).min(1).max(12) : item.type === 'offsets' ? z.array(z.number().int().min(15).max(43200)).min(1).max(10) : z.number().int().min(item.min).max(item.max)])));
  const parsed = schema.safeParse(timing);
  if (!parsed.success) throw new AppError('Enter valid reminder timing', 422);
  if (!allowed.length) return null;
  if (key === 'event-followed') {
    const { value } = await getEventSettings();
    const offsets = normalizeOffsets(parsed.data.defaultOffsetsMinutes, value);
    return { model: EventSettings, patch: { 'reminders.defaultOffsetsMinutes': offsets } };
  }
  const value = await getAutomationSettings();
  const section = key === 'task-digest' ? 'taskReminderDigest' : 'dailyFocus';
  const merged = { ...value, [section]: { ...value[section], ...parsed.data } };
  if (!automationSettingsInput.safeParse(merged).success) throw new AppError('Check reminder times. Morning must be before evening, and delivery times must be unique.', 422);
  return { model: AutomationSettings, defaults: value, patch: Object.fromEntries(Object.entries(parsed.data).map(([field, next]) => [`value.${section}.${field}`, next])) };
}

export async function applyAutomaticTiming(change) {
  if (!change) return;
  if (change.defaults) await change.model.updateOne({ key: 'global' }, { $setOnInsert: { value: change.defaults } }, { upsert: true });
  await change.model.updateOne({ key: 'global' }, { $set: change.patch }, { upsert: true });
}
