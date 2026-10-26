import { AutomaticMessageTemplate } from '../models/AutomaticMessageTemplate.js';
import { AutomaticMessageRevision } from '../models/AutomaticMessageRevision.js';
import { escapeHtml } from '../telegram/formatters.js';
import { AppError } from '../utils/AppError.js';
import { safeHttpsUrl } from './broadcastContent.js';
import { broadcastImageExists } from './broadcastMedia.js';
import { getAutomationSettings } from './automationSettings.service.js';
import { getEventSettings } from './events/eventSettingsService.js';

const common = ['legacyTitle', 'legacyMessage'];
const define = (key, name, category, source, variables = [], timing = null) => ({ key, name, category, source, variables: [...common, ...variables], timing, supportsImage: key.startsWith('summary-'), defaults: { en: { title: '{legacyTitle}', body: '{legacyMessage}' }, ar: { title: '{legacyTitle}', body: '{legacyMessage}' } } });
export const automaticCatalog = [
  define('task-digest', 'Task Digest', 'TASKS', 'taskReminderDigestWorker', ['taskList', 'taskCount'], 'automation.taskReminderDigest'),
  define('focus-morning', 'Daily Focus morning planning', 'FOCUS', 'automationWorker', ['completedCount', 'totalCount'], 'automation.dailyFocus'),
  define('focus-followup', 'Daily Focus planning follow-up', 'FOCUS', 'automationWorker', ['completedCount', 'totalCount'], 'automation.dailyFocus'),
  define('focus-evening', 'Daily Focus evening review', 'FOCUS', 'automationWorker', ['completedCount', 'totalCount'], 'automation.dailyFocus'),
  ...['prepare', 'act', 'follow_up'].map((phase) => define(`debt-${phase}`, `Debt ${phase.replace('_', ' ')}`, 'DEBT', 'reminderPolicyService', ['personName', 'remainingAmount', 'currency', 'dueDate'], 'reminder.policy')),
  ...['prepare', 'act', 'follow_up'].map((phase) => define(`bill-${phase}`, `Bill ${phase.replace('_', ' ')}`, 'BILL', 'reminderPolicyService', ['billName', 'amount', 'dueDate'], 'reminder.policy')),
  define('subscription-renewal', 'Subscription renewal', 'SUBSCRIPTION', 'reminderPolicyService', ['subscriptionName', 'renewalDate', 'amount'], 'reminder.policy'),
  define('goal-review', 'Goal progress review', 'GOAL', 'reminderPolicyService', ['goalTitle', 'progressPercent', 'targetDate'], 'reminder.policy'),
  define('event-followed', 'Followed-event reminder', 'EVENT', 'eventSubscriptionService', ['eventName', 'eventDate', 'venue'], 'events.reminders'),
  define('event-discovery', 'Event discovery', 'EVENT', 'dzEventSyncWorker', ['eventName', 'eventDate', 'venue'], 'events.discovery'),
  define('event-change', 'Event change', 'EVENT', 'dzEventSyncWorker', ['eventName', 'eventDate', 'venue'], null),
  define('summary-morning', 'Morning summary', 'SUMMARY', 'summaryWorker', ['openTasks', 'overdueTasks', 'netAmount', 'currency'], 'user.telegram.morningSummary'),
  define('summary-daily', 'Daily summary', 'SUMMARY', 'summaryWorker', ['openTasks', 'overdueTasks', 'netAmount', 'currency'], 'user.telegram.dailySummary'),
  define('reminder-generic', 'Generic reminder', 'REMINDER', 'reminderDeliveryService', ['taskTitle', 'priority', 'dueDate'], 'user.reminders'),
  define('reminder-followup', 'Reminder follow-up', 'REMINDER', 'reminderDeliveryService', ['taskTitle', 'priority', 'dueDate'], 'user.reminders'),
];
const definitions = new Map(automaticCatalog.map((item) => [item.key, item]));
export const automaticDefinition = (key) => definitions.get(key);
export function automaticReminderKey(reminder) {
  const integration = reminder.metadata?.integration;
  if (integration === 'dzevent') return 'event-followed';
  if (integration === 'dzevent-discovery') return 'event-discovery';
  if (integration === 'dzevent-change') return 'event-change';
  if (reminder.metadata?.automation === 'focus-evening') return 'focus-evening';
  if (reminder.metadata?.automation === 'focus-morning') return String(reminder.policyKey || '').endsWith(':0') ? 'focus-morning' : 'focus-followup';
  if (reminder.entityType === 'debt' && ['prepare', 'act', 'follow_up'].includes(reminder.purpose)) return `debt-${reminder.purpose}`;
  if (reminder.entityType === 'bill' && ['prepare', 'act', 'follow_up'].includes(reminder.purpose)) return `bill-${reminder.purpose}`;
  if (reminder.entityType === 'subscription') return 'subscription-renewal';
  if (reminder.entityType === 'goal') return 'goal-review';
  if (reminder.purpose === 'follow_up' || reminder.followUpCount > 0) return 'reminder-followup';
  return 'reminder-generic';
}
export async function ensureAutomaticTemplates() {
  try { await AutomaticMessageTemplate.bulkWrite(automaticCatalog.map((item) => ({ updateOne: { filter: { key: item.key }, update: { $setOnInsert: { key: item.key, enabled: true, variants: item.defaults } }, upsert: true } })), { ordered: false }); }
  catch (error) { if (!(error.code === 11000 || error.writeErrors?.every((item) => item.code === 11000))) throw error; }
}
export async function getAutomaticTemplate(key) {
  const definition = automaticDefinition(key);
  if (!definition) throw new AppError('Unknown automatic message', 404);
  const row = await AutomaticMessageTemplate.findOne({ key }).lean();
  return row || { key, enabled: true, variants: definition.defaults, buttons: [], imageId: null, revision: 0 };
}
export function validateAutomaticContent(key, variants, buttons = []) {
  const definition = automaticDefinition(key);
  if (!definition) throw new AppError('Unknown automatic message', 404);
  for (const language of ['en', 'ar']) for (const field of ['title', 'body']) {
    const value = variants?.[language]?.[field];
    if (typeof value !== 'string' || !value.trim() || value.length > (field === 'title' ? 180 : 3800) || /[<>]/.test(value)) throw new AppError('Invalid automatic message content', 422);
    for (const match of value.matchAll(/\{([^}]+)\}/g)) if (!definition.variables.includes(match[1])) throw new AppError(`Unsupported variable: ${match[1]}`, 422);
    if (/[{}]/.test(value.replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/g, ''))) throw new AppError('Malformed template variable', 422);
  }
  if (!Array.isArray(buttons) || buttons.length > 8 || buttons.some((row) => !Array.isArray(row) || !row.length || row.length > 4 || row.some((button) => typeof button.label !== 'string' || !button.label.trim() || button.label.length > 64 || !safeHttpsUrl(button.url)))) throw new AppError('Automatic buttons require safe HTTPS URLs', 422);
}
const interpolate = (source, values, limit) => {
  const resolved = source.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_match, key) => String(values[key] ?? '—'));
  if (resolved.length <= limit) return escapeHtml(resolved);
  const shortened = resolved.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '');
  return escapeHtml(`${shortened}…`);
};
export async function renderAutomaticMessage(key, language, values = {}, { preview = false } = {}) {
  const row = await getAutomaticTemplate(key);
  if (!row.enabled && !preview) return null;
  const content = row.variants?.[language === 'ar' ? 'ar' : 'en'] || row.variants.en;
  return { title: interpolate(content.title, values, 180), message: interpolate(content.body, values, 3800), html: true, imageId: row.imageId || null, buttons: (row.buttons || []).map((items) => items.map((button) => ({ text: button.label, url: button.url }))) };
}
export async function listAutomaticTemplates() {
  await ensureAutomaticTemplates();
  const [rows, automation, events] = await Promise.all([AutomaticMessageTemplate.find().lean(), getAutomationSettings(), getEventSettings()]);
  const byKey = new Map(rows.map((item) => [item.key, item]));
  return automaticCatalog.map((definition) => ({ ...definition, ...byKey.get(definition.key), timingValue: definition.timing?.startsWith('automation.') ? automation[definition.timing.split('.')[1]] : definition.timing?.startsWith('events.') ? events.value[definition.timing.split('.')[1]] : null, channels: definition.key === 'task-digest' ? ['telegram'] : ['telegram', 'web'] }));
}
export async function updateAutomaticTemplate(key, input, actorId, note = 'Edited') {
  validateAutomaticContent(key, input.variants, input.buttons || []);
  if (input.imageId && (!automaticDefinition(key).supportsImage || !(await broadcastImageExists(input.imageId)))) throw new AppError('Image is not supported or unavailable for this message', 422);
  const row = await AutomaticMessageTemplate.findOneAndUpdate({ key }, { $setOnInsert: { key, variants: automaticDefinition(key).defaults } }, { upsert: true, new: true });
  row.variants = input.variants;
  row.buttons = input.buttons || [];
  row.imageId = input.imageId || null;
  row.enabled = input.enabled;
  row.updatedBy = actorId;
  row.revision += 1;
  await row.save();
  await AutomaticMessageRevision.create({ template: row._id, revision: row.revision, variants: row.variants.toObject?.() || row.variants, buttons: row.buttons, imageId: row.imageId, enabled: row.enabled, updatedBy: actorId, note });
  return row;
}
export async function resetAutomaticTemplate(key, actorId) {
  const definition = automaticDefinition(key);
  if (!definition) throw new AppError('Unknown automatic message', 404);
  return updateAutomaticTemplate(key, { enabled: true, variants: definition.defaults, buttons: [], imageId: null }, actorId, 'Reset to defaults');
}
export async function automaticTemplateHistory(key, page = 1, limit = 25) {
  const row = await AutomaticMessageTemplate.findOne({ key });
  if (!row) throw new AppError('Template not found', 404);
  const [rows, total] = await Promise.all([AutomaticMessageRevision.find({ template: row._id }).sort({ revision: -1 }).skip((page - 1) * limit).limit(limit).populate('updatedBy', 'fullName email').lean(), AutomaticMessageRevision.countDocuments({ template: row._id })]);
  return { rows, total, page, limit };
}
export async function restoreAutomaticTemplate(key, revision, actorId) {
  if (!Number.isInteger(revision) || revision < 1) throw new AppError('Invalid revision', 422);
  const row = await AutomaticMessageTemplate.findOne({ key });
  if (!row) throw new AppError('Template not found', 404);
  const prior = await AutomaticMessageRevision.findOne({ template: row._id, revision });
  if (!prior) throw new AppError('Revision not found', 404);
  return updateAutomaticTemplate(key, { enabled: prior.enabled, variants: prior.variants, buttons: prior.buttons || [], imageId: prior.imageId || null }, actorId, `Restored revision ${revision}`);
}
