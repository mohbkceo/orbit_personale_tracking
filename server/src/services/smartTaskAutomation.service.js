import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Task } from '../models/Task.js';
import { Reminder } from '../models/Reminder.js';
import { ReminderEvent } from '../models/ReminderEvent.js';
import { DailyFocus } from '../models/DailyFocus.js';
import { TaskExecutionEvent } from '../models/TaskExecutionEvent.js';
import { getSettingsDocument } from './settingsService.js';
import { getAutomationSettings, automationTimezone } from './automationSettings.service.js';

dayjs.extend(utc); dayjs.extend(timezone);
const rank = { low: 0, medium: 1, high: 2, urgent: 3 };
const event = (reminder, eventType) => ReminderEvent.create({ user: reminder.user, reminderId: reminder._id, eventType });
const intervalMinutes = (band, rules) => ({ far: rules.thresholds.farIntervalDays * 1440, medium: rules.thresholds.mediumIntervalDays * 1440, near: rules.thresholds.nearIntervalDays * 1440, urgent: rules.thresholds.urgentIntervalHours * 60, overdue: rules.thresholds.overdueIntervalHours * 60 })[band];

export function evaluateTaskAutomation(task, context, rules) {
  const now = context.now || new Date();
  if (!rules.general.enabled || !rules.general.workerEnabled || !task.dueDate || task.archived || task.reminderMode !== 'automatic' || ['completed', 'cancelled'].includes(task.status)) return { action: 'none', reason: 'Ineligible task' };
  if (task.executionState === 'blocked' && rules.reminderBehavior.blockedTaskPolicy === 'pause') return { action: 'none', reason: 'Blocked task paused' };
  if (task.executionState === 'started' && rules.taskExecution.startFollowUpEnabled) return { action: 'none', reason: 'Start check-in handles this task' };
  const days = context.daysUntilDue;
  const t = rules.thresholds;
  const lead = task.priority === 'urgent' ? t.urgentPriorityLeadDays : task.priority === 'high' ? t.highPriorityLeadDays : 0;
  const effectiveDays = days - lead;
  const band = days < 0 ? 'overdue' : effectiveDays <= t.urgentDays ? 'urgent' : effectiveDays <= t.nearDays ? 'near' : effectiveDays <= t.mediumDays ? 'medium' : 'far';
  const count = Math.max(task.postponeCount || 0, task.ignoreCount || 0);
  const force = count >= rules.escalation.forceDecisionThreshold;
  const escalate = (task.postponeCount || 0) >= rules.escalation.postponeThreshold || (task.ignoreCount || 0) >= rules.escalation.ignoreThreshold || (context.normalReminderCount || 0) >= rules.escalation.maxNormalReminders;
  const level = Math.min(rules.escalation.maxLevel, force ? 2 : escalate ? 1 : 0);
  const purpose = level ? 'review' : band === 'far' || band === 'medium' ? 'prepare' : 'act';
  const needsAction = task.executionState !== 'started' && !task.nextAction && days >= rules.taskExecution.nextActionMinimumDays && rules.taskExecution.nextActionPromptsEnabled;
  const message = level === 2 || band === 'overdue'
    ? `Decide what to do with ${task.title}: start, choose a date, return to backlog, or drop it.`
    : level === 1
      ? `You've postponed or missed ${task.title} several times. What's preventing progress?`
      : task.executionState === 'blocked'
        ? `What's blocking ${task.title}? Choose a next step when you're ready.`
      : needsAction
        ? `Choose one concrete next action for ${task.title}.`
      : band === 'far'
        ? `How is ${task.title} progressing?${task.nextAction ? ` Next: ${task.nextAction}` : ''}`
        : band === 'medium'
            ? `Next step for ${task.title}: ${task.nextAction || 'choose a concrete action'}.`
            : task.executionState === 'started' ? `How is ${task.title} going?` : `Start ${task.title}${task.nextAction ? ` — ${task.nextAction}` : ''}.`;
  const interval = intervalMinutes(band, rules);
  const earliest = context.lastDeliveredAt ? new Date(new Date(context.lastDeliveredAt).getTime() + Math.max(interval, rules.escalation.cooldownMinutes) * 60000) : now;
  const nextTriggerAt = new Date(Math.max(now.getTime() + 60000, earliest.getTime()));
  const boosted = context.inDailyFocus && rules.reminderBehavior.dailyFocusPriorityBoost;
  const priority = boosted && rank[task.priority] < rank.high ? 'high' : task.priority;
  return { action: 'schedule', priority, reason: `${band} deadline; escalation ${level}`, reminderPurpose: purpose, nextTriggerAt, requireAcknowledgement: rules.reminderBehavior.requireAcknowledgementFrom !== 'none' && rank[priority] >= rank[rules.reminderBehavior.requireAcknowledgementFrom], message, band, escalationLevel: level, intervalMinutes: interval, needsAction };
}

export async function scheduleSmartTaskCue(userId, task, { now = new Date(), rules } = {}) {
  rules ||= await getAutomationSettings();
  if (!task.dueDate || ['completed', 'cancelled'].includes(task.status) || task.archived || task.reminderMode !== 'automatic') {
    const existing = await Reminder.findOne({ user: userId, policyKey: `task:${task._id}:smart`, customized: false, status: { $in: ['scheduled', 'active', 'snoozed', 'waiting'] } });
    if (existing) { existing.status = 'cancelled'; await existing.save(); await event(existing, 'cancelled'); }
    return null;
  }
  const settings = await getSettingsDocument(userId);
  const zone = automationTimezone(settings, rules);
  const day = dayjs.utc(task.dueDate).format('YYYY-MM-DD');
  const daysUntilDue = dayjs(day).diff(dayjs(now).tz(zone).format('YYYY-MM-DD'), 'day');
  const focus = await DailyFocus.findOne({ user: userId, date: dayjs(now).tz(zone).format('YYYY-MM-DD'), 'items.task': task._id }).select('_id');
  const key = `task:${task._id}:smart`;
  let reminder = await Reminder.findOne({ user: userId, policyKey: key });
  if (reminder?.customized) return reminder;
  if (reminder?.status === 'snoozed' && reminder.nextTriggerAt > now) return reminder;
  if (reminder?.status === 'active' && reminder.deliveredAt && !reminder.acknowledgedAt && reminder.metadata?.ignoreRecordedFor !== reminder.deliveredAt.toISOString()) {
    const minTime = reminder.deliveredAt.getTime() + rules.escalation.cooldownMinutes * 60000;
    if (now.getTime() >= minTime) {
      const marker = reminder.deliveredAt.toISOString();
      const claimed = await Reminder.updateOne({ _id: reminder._id, user: userId, 'metadata.ignoreRecordedFor': { $ne: marker } }, { $set: { 'metadata.ignoreRecordedFor': marker } });
      if (claimed.modifiedCount) {
        await Task.updateOne({ _id: task._id, user: userId }, { $inc: { ignoreCount: 1 } });
        task.ignoreCount = (task.ignoreCount || 0) + 1;
        reminder.metadata = { ...reminder.metadata, ignoreRecordedFor: marker };
        await event(reminder, 'ignored', 'system');
        await TaskExecutionEvent.create({ user: userId, task: task._id, type: 'ignored', channel: 'system' });
      } else {
        reminder = await Reminder.findById(reminder._id);
        task.ignoreCount = (await Task.findById(task._id)).ignoreCount;
      }
    }
  }
  const decision = evaluateTaskAutomation(task, { now, daysUntilDue, inDailyFocus: Boolean(focus), lastDeliveredAt: reminder?.deliveredAt, normalReminderCount: reminder?.triggerCount || 0 }, rules);
  if (decision.action === 'none') {
    if (reminder && ['scheduled', 'snoozed'].includes(reminder.status) && !reminder.customized) { reminder.status = 'suppressed'; await reminder.save(); await event(reminder, 'suppressed'); }
    return null;
  }
  if (reminder?.status === 'scheduled' && reminder.nextTriggerAt <= now && reminder.claimUntil) return reminder;
  if (reminder?.status === 'active' && reminder.deliveredAt && decision.nextTriggerAt > now && reminder.deliveredAt.getTime() + rules.escalation.cooldownMinutes * 60000 > now.getTime()) return reminder;
  const recent = await Reminder.exists({ user: userId, entityType: 'task', entityId: task._id, _id: { $ne: reminder?._id }, deliveredAt: { $gte: new Date(now.getTime() - rules.reminderBehavior.duplicateSuppressionMinutes * 60000) } });
  if (recent) return reminder;
  const data = {
    user: userId, title: task.title, message: decision.message, source: 'automatic', mode: 'automatic', autoGenerated: true,
    entityType: 'task', entityId: task._id, purpose: decision.reminderPurpose, priority: decision.priority,
    requireAcknowledgement: decision.requireAcknowledgement, trigger: { type: 'datetime', at: decision.nextTriggerAt, timezone: zone },
    nextTriggerAt: decision.nextTriggerAt, status: 'scheduled',
    deliveryChannels: Object.entries(settings.reminders?.deliveryChannels || { telegram: true }).filter(([, enabled]) => enabled).map(([name]) => name),
    metadata: { ...(reminder?.metadata || {}), automation: 'smart', reason: decision.reason, band: decision.band, escalationLevel: decision.escalationLevel, intervalMinutes: decision.intervalMinutes, needsAction: decision.needsAction },
  };
  if (reminder) {
    if (reminder.status === 'waiting' || (reminder.status === 'scheduled' && reminder.nextTriggerAt > now && !reminder.deliveredAt && reminder.message === decision.message && reminder.priority === decision.priority && reminder.metadata?.intervalMinutes === decision.intervalMinutes)) return reminder;
    reminder = await Reminder.findOneAndUpdate({ _id: reminder._id, user: userId, customized: false, claimUntil: null, status: reminder.status }, { $set: { ...data, acknowledgedAt: null } }, { new: true }) || reminder;
  } else {
    try { reminder = await Reminder.create({ ...data, policyKey: key }); await event(reminder, 'generated'); }
    catch (error) { if (error.code !== 11000) throw error; reminder = await Reminder.findOne({ user: userId, policyKey: key }); }
  }
  return reminder;
}
