import { AutomationSettings } from '../models/AutomationSettings.js';

export const automationDefaults = Object.freeze({
  general: { enabled: true, workerEnabled: true, timezoneBehavior: 'user', activeStart: '08:00', activeEnd: '22:00', quietEnabled: true, quietStart: '22:00', quietEnd: '08:00' },
  dailyFocus: { enabled: true, maxTasks: 3, morningEnabled: true, morningTime: '08:00', planningReminderEnabled: true, planningReminderIntervalMinutes: 120, maxPlanningReminders: 2, taskReminderEnabled: true, taskReminderTime: '10:00', taskReminderIntervalMinutes: 180, maxTaskReminders: 2, eveningEnabled: true, eveningTime: '20:00' },
  taskExecution: { nextActionPromptsEnabled: true, nextActionMinimumDays: 7, startFollowUpEnabled: true, startCheckInDelayMinutes: 90, maxStartCheckIns: 2 },
  thresholds: { farDays: 30, mediumDays: 14, nearDays: 7, urgentDays: 2, highPriorityLeadDays: 2, urgentPriorityLeadDays: 5, farIntervalDays: 14, mediumIntervalDays: 7, nearIntervalDays: 2, urgentIntervalHours: 12, overdueIntervalHours: 24 },
  escalation: { maxNormalReminders: 4, postponeThreshold: 2, ignoreThreshold: 2, forceDecisionThreshold: 4, maxLevel: 2, cooldownMinutes: 120 },
  reminderBehavior: { allowBundling: true, bundleLowPriority: true, duplicateSuppressionMinutes: 120, dailyFocusPriorityBoost: true, requireAcknowledgementFrom: 'high', blockedTaskPolicy: 'pause' },
});

export function mergeAutomationSettings(value = {}) {
  return Object.fromEntries(Object.entries(automationDefaults).map(([section, defaults]) => [section, { ...defaults, ...(value?.[section] || {}) }]));
}

export function automationTimezone(userSettings, automation) {
  return automation.general.timezoneBehavior === 'utc' ? 'UTC' : userSettings.timezone;
}

export async function getAutomationSettings() {
  const row = await AutomationSettings.findOne({ key: 'global' }).lean();
  return mergeAutomationSettings(row?.value);
}

export async function updateAutomationSettings(value) {
  const merged = mergeAutomationSettings(value);
  await AutomationSettings.findOneAndUpdate({ key: 'global' }, { $set: { value: merged } }, { upsert: true, new: true });
  return merged;
}
