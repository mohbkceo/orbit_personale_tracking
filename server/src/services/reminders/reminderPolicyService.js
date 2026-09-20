import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { localDateTime } from './reminderTime.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const at = (date, time, zone, offset = 0) =>
  dayjs(localDateTime(date, time, zone))
    .add(offset, 'minute')
    .toDate();
const entry = (key, purpose, when, message, priority = 'medium') => ({
  key,
  purpose,
  when,
  message,
  priority,
});

export function buildReminderPlan(entityType, entity, settings) {
  const zone = settings.timezone;
  const plan = [];
  const title = entity.title || entity.name || entity.personName;
  const isToday = (date) =>
    dayjs.utc(date).format('YYYY-MM-DD') === dayjs().tz(zone).format('YYYY-MM-DD');
  if (
    entityType === 'task' &&
    entity.dueDate &&
    !['completed', 'cancelled'].includes(entity.status)
  ) {
    const time = entity.dueTime || '09:00';
    if (entity.dueTime && ['high', 'urgent'].includes(entity.priority))
      plan.push(
        entry(
          'prepare',
          'prepare',
          at(entity.dueDate, time, zone, entity.priority === 'urgent' ? -120 : -60),
          `Prepare for ${title}.`,
          entity.priority,
        ),
      );
    plan.push(
      entry(
        'act',
        'act',
        at(entity.dueDate, time, zone),
        `${title} is ready to handle.`,
        entity.priority,
      ),
    );
    if (
      settings.reminders?.incompleteFollowUpsEnabled !== false &&
      (settings.reminders?.maxAutomaticFollowUps ?? 2) > 0
    )
      plan.push(
        entry(
          'follow-up',
          'follow_up',
          at(entity.dueDate, entity.dueTime || '17:00', zone, entity.dueTime ? 180 : 0),
          `Still need to handle ${title}?`,
          entity.priority,
        ),
      );
    if (isToday(entity.dueDate) && plan.find((item) => item.key === 'act').when < new Date()) {
      const action = plan.find((item) => item.key === 'act');
      action.when = dayjs().add(5, 'minute').toDate();
      const followUp = plan.find((item) => item.key === 'follow-up');
      if (followUp && followUp.when <= action.when)
        followUp.when = dayjs(action.when).add(3, 'hour').toDate();
    }
  }
  if (
    entityType === 'debt' &&
    entity.dueDate &&
    entity.remainingAmount > 0 &&
    entity.status !== 'paid'
  ) {
    const context = `${entity.personName} · ${entity.remainingAmount} ${entity.currency}`;
    plan.push(
      entry(
        'prepare',
        'prepare',
        at(entity.dueDate, '09:00', zone, -1440),
        `${entity.type === 'payable' ? 'Payment due soon' : 'Expected payment soon'}: ${context}`,
      ),
    );
    plan.push(
      entry(
        'act',
        'act',
        at(entity.dueDate, '09:00', zone),
        `${entity.type === 'payable' ? 'Payment due today' : 'Payment expected today'}: ${context}`,
      ),
    );
    plan.push(
      entry(
        'follow-up',
        'follow_up',
        at(entity.dueDate, '10:00', zone, 2880),
        `Still open: ${context}`,
      ),
    );
    if (isToday(entity.dueDate) && plan[1].when < new Date())
      plan[1].when = dayjs().add(5, 'minute').toDate();
  }
  if (entityType === 'bill' && entity.dueDate && entity.status !== 'paid') {
    plan.push(
      entry(
        'prepare',
        'prepare',
        at(entity.dueDate, '09:00', zone, -1440),
        `${title} is due tomorrow.`,
      ),
    );
    plan.push(entry('act', 'act', at(entity.dueDate, '09:00', zone), `${title} is due today.`));
    plan.push(
      entry(
        'follow-up',
        'follow_up',
        at(entity.dueDate, '10:00', zone, 1440),
        `${title} remains unpaid.`,
      ),
    );
    if (isToday(entity.dueDate) && plan[1].when < new Date())
      plan[1].when = dayjs().add(5, 'minute').toDate();
  }
  if (entityType === 'subscription' && entity.status === 'active' && entity.nextBillingDate) {
    plan.push(
      entry(
        'renewal',
        'prepare',
        at(entity.nextBillingDate, '09:00', zone, -4320),
        `${title} renews in three days.`,
      ),
    );
    if (plan[0].when < new Date() && dayjs(entity.nextBillingDate).isAfter(dayjs()))
      plan[0].when = dayjs().add(5, 'minute').toDate();
  }
  if (entityType === 'goal' && entity.status === 'active') {
    const targetReview = entity.targetDate ? at(entity.targetDate, '10:00', zone, -10080) : null;
    const when =
      targetReview && dayjs(targetReview).isAfter(dayjs())
        ? targetReview
        : dayjs()
            .add(entity.targetDate ? 1 : 7, 'day')
            .toDate();
    const progress = entity.targetAmount
      ? ` Progress: ${Math.round(((entity.currentAmount || 0) / entity.targetAmount) * 100)}%.`
      : '';
    plan.push(entry('review', 'review', when, `Review progress on ${title}.${progress}`, 'low'));
  }
  // A newly enabled policy never emits a backlog of old cues.
  const cutoff = dayjs().subtract(1, 'hour');
  return plan.filter((item) => dayjs(item.when).isAfter(cutoff));
}
