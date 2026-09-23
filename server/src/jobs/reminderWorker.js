import crypto from 'node:crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Reminder } from '../models/Reminder.js';
import { event } from '../services/reminders/reminderService.js';
import { nextOccurrence } from '../services/reminders/reminderTime.js';
import { coordinateReminder } from '../services/reminders/reminderCoordinatorService.js';
import { getAutomationSettings } from '../services/automationSettings.service.js';
import {
  deliverReminder,
  deliverReminderBundle,
} from '../services/reminders/reminderDeliveryService.js';

const workerId = crypto.randomUUID();
dayjs.extend(utc);
dayjs.extend(timezone);

async function processLowPriorityBundle(now, limit) {
  if (limit < 2) return 0;
  const automation = await getAutomationSettings();
  if (!automation.reminderBehavior.allowBundling || !automation.reminderBehavior.bundleLowPriority) return 0;
  const first = await Reminder.findOne({
    archived: false,
    priority: 'low',
    'metadata.automation': { $exists: false },
    entityType: { $in: ['task', 'custom'] },
    'trigger.type': 'datetime',
    status: { $in: ['scheduled', 'snoozed'] },
    nextTriggerAt: { $lte: now },
    claimUntil: null,
  }).select('user');
  if (!first) return 0;
  const claimed = [];
  for (let index = 0; index < Math.min(3, limit); index += 1) {
    const item = await Reminder.findOneAndUpdate(
      {
        user: first.user,
        archived: false,
        priority: 'low',
        'metadata.automation': { $exists: false },
        entityType: { $in: ['task', 'custom'] },
        'trigger.type': 'datetime',
        status: { $in: ['scheduled', 'snoozed'] },
        nextTriggerAt: { $lte: now },
        claimUntil: null,
      },
      {
        $set: {
          claimUntil: dayjs(now).add(5, 'minute').toDate(),
          processingAt: now,
          processingBy: workerId,
        },
      },
      { sort: { nextTriggerAt: 1 }, new: true },
    );
    if (!item) break;
    claimed.push(item);
  }
  if (claimed.length < 2) {
    await Reminder.updateMany(
      { _id: { $in: claimed.map((item) => item._id) }, processingBy: workerId },
      { $set: { claimUntil: null }, $unset: { processingBy: '' } },
    );
    return 0;
  }
  const linked = claimed
    .filter((item) => item.entityId)
    .map((item) => `${item.entityType}:${item.entityId}`);
  if (new Set(linked).size !== linked.length) {
    await Reminder.updateMany(
      { _id: { $in: claimed.map((item) => item._id) }, processingBy: workerId },
      { $set: { claimUntil: null }, $unset: { processingBy: '' } },
    );
    return 0;
  }
  try {
    const decisions = await Promise.all(claimed.map((item) => coordinateReminder(item, now)));
    if (decisions.some((decision) => decision.action !== 'send')) {
      await Reminder.updateMany(
        { _id: { $in: claimed.map((item) => item._id) }, processingBy: workerId },
        { $set: { claimUntil: null }, $unset: { processingBy: '' } },
      );
      return 0;
    }
    const result = await deliverReminderBundle(claimed);
    if (!result.sent && !result.web) throw new Error('No delivery channel available');
    for (const item of claimed) {
      item.status = 'active';
      item.deliveredAt = now;
      item.lastTriggeredAt = now;
      item.triggerCount += 1;
      item.claimUntil = null;
      item.processingBy = null;
      await item.save();
      if (result.telegramError)
        await event(item, 'delivery_failed', 'telegram', { message: result.telegramError });
      const local = dayjs(now).tz(item.trigger?.timezone || 'UTC');
      await event(item, 'sent', result.sent ? 'telegram' : 'web', {
        bundled: true,
        priority: item.priority,
        entityType: item.entityType,
        hour: local.hour(),
        dayOfWeek: local.day(),
      });
    }
    return claimed.length;
  } catch (error) {
    for (const item of claimed)
      await event(item, 'delivery_failed', 'system', { message: error.message });
    await Reminder.updateMany(
      { _id: { $in: claimed.map((item) => item._id) }, processingBy: workerId },
      { $set: { claimUntil: dayjs(now).add(15, 'minute').toDate() }, $unset: { processingBy: '' } },
    );
    return 0;
  }
}

export async function processDueReminders({ now = new Date(), limit = 50 } = {}) {
  let processed = await processLowPriorityBundle(now, limit);
  for (let index = processed; index < limit; index += 1) {
    // Atomic claim with a lease allows another process to recover after a crash.
    const reminder = await Reminder.findOneAndUpdate(
      {
        archived: false,
        nextTriggerAt: { $lte: now },
        $and: [
          {
            $or: [
              { status: { $in: ['scheduled', 'snoozed'] } },
              {
                status: 'active',
                'trigger.type': 'recurring',
                'metadata.recurrenceEnded': { $ne: true },
              },
              {
                status: 'active',
                'followUp.enabled': true,
                'metadata.followUpEnded': { $ne: true },
              },
            ],
          },
          { $or: [{ claimUntil: null }, { claimUntil: { $lte: now } }] },
        ],
      },
      {
        $set: {
          claimUntil: dayjs(now).add(5, 'minute').toDate(),
          processingAt: now,
          processingBy: workerId,
        },
      },
      { sort: { nextTriggerAt: 1 }, new: true },
    );
    if (!reminder) break;
    processed += 1;
    try {
      let audit = null;
      let failedTelegram = null;
      // A missed standalone cue older than a week is no longer a useful interruption.
      if (
        reminder.trigger?.type === 'recurring' &&
        dayjs(now).diff(reminder.nextTriggerAt, 'day') > 1
      ) {
        let next = reminder.nextTriggerAt;
        for (let step = 0; step < 1000 && next && dayjs(now).diff(next, 'day') > 1; step += 1)
          next = nextOccurrence(next, reminder.trigger.recurrence, reminder.trigger.timezone);
        if (next && dayjs(now).diff(next, 'day') > 1) next = null;
        if (next) {
          reminder.nextTriggerAt = next;
          audit = ['rescheduled', 'system', { reason: 'Advanced missed recurrence' }];
        } else {
          reminder.status = 'expired';
          audit = ['expired'];
        }
      } else if (
        reminder.entityType === 'custom' &&
        dayjs(now).diff(reminder.nextTriggerAt, 'day') > 7 &&
        reminder.trigger?.type !== 'recurring'
      ) {
        reminder.status = 'expired';
        audit = ['expired'];
      } else {
        const decision = await coordinateReminder(reminder, now);
        if (decision.action === 'resolve') {
          reminder.status = 'completed';
          reminder.completedAt = now;
          audit = ['completed', 'system', { reason: decision.reason }];
        }
        if (decision.action === 'suppress') {
          reminder.status = 'suppressed';
          audit = ['suppressed', 'system', { reason: decision.reason }];
        }
        if (decision.action === 'defer') {
          reminder.nextTriggerAt = decision.at || dayjs(now).add(1, 'hour').toDate();
          audit = ['rescheduled', 'system', { reason: decision.reason }];
        }
        if (decision.action === 'send') {
          const result = await deliverReminder(reminder);
          if (!result.sent && !result.web) throw new Error('No delivery channel available');
          const occurrenceAt = reminder.nextTriggerAt;
          let next = null;
          if (reminder.trigger?.type === 'recurring') {
            const postponed = Object.hasOwn(reminder.metadata || {}, 'postponedNextOccurrenceAt');
            next = postponed
              ? reminder.metadata.postponedNextOccurrenceAt
              : nextOccurrence(occurrenceAt, reminder.trigger.recurrence, reminder.trigger.timezone);
            for (let step = 0; step < 1000 && next && new Date(next) <= now; step += 1)
              next = nextOccurrence(next, reminder.trigger.recurrence, reminder.trigger.timezone);
            if (next && new Date(next) <= now) next = null;
          }
          const isFollowUp = reminder.followUp?.enabled && reminder.triggerCount > 0;
          reminder.status = 'active';
          reminder.deliveredAt = now;
          reminder.lastTriggeredAt = now;
          reminder.triggerCount += 1;
          const metadata = { ...reminder.metadata };
          delete metadata.postponedNextOccurrenceAt;
          reminder.metadata = {
            ...metadata,
            lastDecision:
              'Sent after checking current status, quiet hours, and recent equivalent cues.',
            lastDecisionAt: now,
          };
          if (reminder.trigger?.type === 'recurring') {
            reminder.nextTriggerAt = next || occurrenceAt;
            reminder.metadata = {
              ...reminder.metadata,
              currentOccurrenceAt: occurrenceAt,
              recurrenceEnded: !next,
            };
          }
          if (reminder.purpose === 'follow_up' || isFollowUp) reminder.followUpCount += 1;
          if (reminder.followUp?.enabled && reminder.trigger?.type !== 'recurring') {
            const more = reminder.followUpCount < (reminder.followUp.maxCount ?? 1);
            reminder.metadata = { ...reminder.metadata, followUpEnded: !more };
            if (more)
              reminder.nextTriggerAt = dayjs(now)
                .add(reminder.followUp.delayMinutes || 1440, 'minute')
                .toDate();
          }
          failedTelegram = result.telegramError;
          const local = dayjs(now).tz(reminder.trigger?.timezone || 'UTC');
          audit = [
            'sent',
            result.sent ? 'telegram' : 'web',
            {
              priority: reminder.priority,
              entityType: reminder.entityType,
              hour: local.hour(),
              dayOfWeek: local.day(),
            },
          ];
        }
      }
      reminder.claimUntil = null;
      reminder.processingBy = null;
      await reminder.save();
      if (failedTelegram)
        await event(reminder, 'delivery_failed', 'telegram', { message: failedTelegram });
      if (audit) await event(reminder, ...audit);
    } catch (error) {
      if (error.name === 'VersionError') {
        const fresh = await Reminder.findById(reminder._id);
        if (fresh?.processingBy !== workerId) continue;
      }
      await event(reminder, 'delivery_failed', 'system', { message: error.message });
      await Reminder.updateOne(
        { _id: reminder._id, processingBy: workerId },
        {
          $set: { claimUntil: dayjs(now).add(15, 'minute').toDate() },
          $unset: { processingBy: '' },
        },
      );
    }
  }
  return processed;
}
