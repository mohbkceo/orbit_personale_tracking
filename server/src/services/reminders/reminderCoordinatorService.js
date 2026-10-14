import { Reminder } from '../../models/Reminder.js';
import { User } from '../../models/User.js';
import { getSettingsDocument } from '../settingsService.js';
import { checkAccess } from '../accessService.js';
import { canAccess } from '../entitlementService.js';
import { isEntityResolved, linkedEntity } from './reminderService.js';
import { afterQuietHours, inQuietHours, nextActiveTime } from './reminderTime.js';
import { getAutomationSettings, automationTimezone } from '../automationSettings.service.js';
import { DailyFocus } from '../../models/DailyFocus.js';
import { getEventSettings, getEffectiveEventSettings } from '../events/eventSettingsService.js';
import { EventSubscription } from '../../models/EventSubscription.js';
import { DzEvent } from '../../models/DzEvent.js';

export async function coordinateReminder(reminder, now = new Date()) {
  const user = await User.findById(reminder.user);
  if (!user) return { action: 'suppress', reason: 'Owner no longer exists' };
  if (!(await checkAccess(user)).eligible)
    return { action: 'defer', at: new Date(now.getTime() + 86400000), reason: 'Access inactive' };
  const feature = reminder.metadata?.integration?.startsWith('dzevent') ? 'events' : reminder.metadata?.automation?.startsWith('focus-') ? 'daily-focus' : 'reminders';
  if (!(await canAccess(user, feature)).allowed) return { action: 'defer', at: new Date(now.getTime() + 86400000), reason: 'Feature unavailable' };
  const settings = await getSettingsDocument(reminder.user);
  const isDzEvent = reminder.metadata?.integration === 'dzevent';
  if (reminder.metadata?.integration?.startsWith('dzevent-')) {
    const { value: eventSettings } = await getEventSettings();
    if (!eventSettings.integration.enabled || (reminder.metadata.integration === 'dzevent-discovery' && !eventSettings.discovery.enabled) || (reminder.metadata.integration === 'dzevent-change' && !eventSettings.changes.enabled)) return { action: 'suppress', reason: 'Event notifications disabled' };
    if (reminder.metadata.integration === 'dzevent-discovery' && !(await getEffectiveEventSettings(reminder.user)).discoveryEnabled) return { action: 'suppress', reason: 'Discovery disabled by user' };
    if (reminder.metadata.integration === 'dzevent-change') {
      const subscription = await EventSubscription.findOne({ user: reminder.user, event: reminder.metadata.eventIds?.[0], status: 'active' });
      if (!subscription) return { action: 'suppress', reason: 'Event unfollowed' };
      const effective = await getEffectiveEventSettings(reminder.user, subscription).catch(() => null);
      if (!effective || !(reminder.metadata.changeFields || []).some((field) => effective.changeAlerts[field])) return { action: 'suppress', reason: 'Change alert disabled' };
    }
  }
  if (isDzEvent) {
    const { value: eventSettings } = await getEventSettings();
    const subscription = await EventSubscription.findOne({ _id: reminder.metadata.eventSubscriptionId, user: reminder.user, status: 'active' });
    if (!subscription || !eventSettings.integration.enabled || !eventSettings.reminders.enabled) return { action: 'suppress', reason: 'Event reminders disabled or unfollowed' };
    const cachedEvent = await DzEvent.findById(subscription.event);
    if (!cachedEvent || cachedEvent.verificationStatus === 'unavailable') return { action: 'suppress', reason: 'Event information unavailable' };
    if (cachedEvent.scheduleStatus === 'postponed') return { action: 'suppress', reason: 'Event postponed' };
    if (!reminder.deliveryChannels.some((channel) => eventSettings.delivery[channel])) return { action: 'suppress', reason: 'Event delivery channels disabled' };
    if (reminder.metadata.scheduleStatus === 'cancelled') return { action: 'suppress', reason: 'Event cancelled by provider' };
    if (reminder.metadata.eventStartsAt && new Date(reminder.metadata.eventStartsAt) <= now) return { action: 'suppress', reason: 'Event already started' };
  }
  const automation = reminder.metadata?.automation ? await getAutomationSettings() : null;
  if (automation && (!automation.general.enabled || !automation.general.workerEnabled)) return { action: 'defer', at: new Date(now.getTime() + 3600000), reason: 'Automation disabled' };
  const timing = automation ? { timezone: automationTimezone(settings, automation), reminders: { activeHours: { start: automation.general.activeStart, end: automation.general.activeEnd }, quietHours: { enabled: automation.general.quietEnabled, start: automation.general.quietStart, end: automation.general.quietEnd } } } : settings;
  if (reminder.metadata?.automation?.startsWith('focus-')) {
    if (!automation.dailyFocus.enabled) return { action: 'defer', at: new Date(now.getTime() + 3600000), reason: 'Daily Focus disabled' };
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: timing.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (reminder.metadata.date !== today) return { action: 'suppress', reason: 'Focus day passed' };
  }
  if (!settings.reminders?.enabled)
    return { action: 'defer', at: new Date(now.getTime() + 3600000), reason: 'Reminders disabled' };
  if (
    settings.reminders?.deliveryChannels?.telegram === false &&
    settings.reminders?.deliveryChannels?.web === false
  )
    return {
      action: 'defer',
      at: new Date(now.getTime() + 3600000),
      reason: 'Delivery channels disabled',
    };
  if (reminder.autoGenerated && settings.reminders?.automaticEnabled === false)
    return {
      action: 'defer',
      at: new Date(now.getTime() + 86400000),
      reason: 'Automatic reminders disabled',
    };
  if (reminder.entityType !== 'custom') {
    const entity = await linkedEntity(reminder.user, reminder.entityType, reminder.entityId).catch(
      () => null,
    );
    if (isEntityResolved(reminder.entityType, entity))
      return { action: 'resolve', reason: 'Linked entity resolved' };
  }
  if (reminder.metadata?.automation === 'focus-morning') {
    const focus = await DailyFocus.findOne({ _id: reminder.metadata.focusId, user: reminder.user });
    if (!focus || focus.planningCompleted) return { action: 'suppress', reason: 'Planning complete' };
  }
  if (reminder.status === 'waiting') return { action: 'defer', reason: 'Waiting for blocker' };
  if (
    reminder.autoGenerated &&
    reminder.purpose === 'follow_up' &&
    (!settings.reminders?.incompleteFollowUpsEnabled ||
      reminder.followUpCount >= (settings.reminders?.maxAutomaticFollowUps ?? 2))
  )
    return { action: 'suppress', reason: 'Follow-up limit' };
  if (isDzEvent && ['skip', 'move_earlier'].includes(reminder.metadata.quietHoursPolicy) && inQuietHours(now, timing)) return { action: 'suppress', reason: 'Event reminder falls in quiet hours' };
  if (inQuietHours(now, timing) && !(isDzEvent && reminder.metadata.quietHoursPolicy === 'deliver_exact'))
    return { action: 'defer', at: afterQuietHours(now, timing), reason: 'Quiet hours' };
  const activeAt = nextActiveTime(now, timing);
  if (isDzEvent && ['skip', 'move_earlier'].includes(reminder.metadata.quietHoursPolicy) && activeAt > now) return { action: 'suppress', reason: 'Event reminder falls outside active hours' };
  if (activeAt > now && !(isDzEvent && reminder.metadata.quietHoursPolicy === 'deliver_exact'))
    return { action: 'defer', at: activeAt, reason: 'Outside active hours' };
  const spacing = (automation ? automation.reminderBehavior.duplicateSuppressionMinutes : settings.reminders?.minimumReminderSpacingMinutes ?? 120) * 60000;
  if (reminder.entityId && reminder.priority !== 'urgent') {
    const recent = await Reminder.findOne({
      user: reminder.user,
      entityType: reminder.entityType,
      entityId: reminder.entityId,
      _id: { $ne: reminder._id },
      deliveredAt: { $gte: new Date(now.getTime() - spacing) },
    }).sort({ deliveredAt: -1 });
    if (recent)
      return {
        action: 'defer',
        at: new Date(recent.deliveredAt.getTime() + spacing),
        reason: 'Equivalent cue sent recently',
      };
  }
  return { action: 'send' };
}
