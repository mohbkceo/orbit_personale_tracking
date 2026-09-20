import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export function localDateTime(date, time, zone) {
  // Date-only values arrive from HTML as UTC midnight. Keep their calendar day.
  const day = dayjs.utc(date).format('YYYY-MM-DD');
  return dayjs.tz(`${day} ${time}`, 'YYYY-MM-DD HH:mm', zone).toDate();
}

export function nextActiveTime(date, settings) {
  const zone = settings.timezone;
  const start = settings.reminders?.activeHours?.start || '08:00';
  const end = settings.reminders?.activeHours?.end || '22:00';
  const local = dayjs(date).tz(zone);
  const clock = local.format('HH:mm');
  if (start === end || (start > end && (clock >= start || clock < end))) return date;
  if (start > end) return dayjs.tz(`${local.format('YYYY-MM-DD')} ${start}`, 'YYYY-MM-DD HH:mm', zone).toDate();
  if (clock < start)
    return dayjs.tz(`${local.format('YYYY-MM-DD')} ${start}`, 'YYYY-MM-DD HH:mm', zone).toDate();
  if (clock >= end)
    return dayjs
      .tz(`${local.add(1, 'day').format('YYYY-MM-DD')} ${start}`, 'YYYY-MM-DD HH:mm', zone)
      .toDate();
  return date;
}

export function inQuietHours(date, settings) {
  if (!settings.reminders?.quietHours?.enabled) return false;
  const { start = '22:00', end = '08:00' } = settings.reminders.quietHours;
  if (start === end) return false;
  const clock = dayjs(date).tz(settings.timezone).format('HH:mm');
  return start < end ? clock >= start && clock < end : clock >= start || clock < end;
}

export function afterQuietHours(date, settings) {
  const end = settings.reminders?.quietHours?.end || '08:00';
  const local = dayjs(date).tz(settings.timezone);
  const day = local.format('HH:mm') >= end ? local.add(1, 'day') : local;
  return dayjs
    .tz(`${day.format('YYYY-MM-DD')} ${end}`, 'YYYY-MM-DD HH:mm', settings.timezone)
    .toDate();
}

export function nextOccurrence(after, rule, zone) {
  if (!rule?.frequency) return null;
  const interval = rule.interval || 1;
  const current = dayjs(after).tz(zone);
  let candidate = current;
  if (rule.frequency === 'daily') candidate = current.add(interval, 'day');
  if (rule.frequency === 'weekly') {
    const days = [...(rule.daysOfWeek?.length ? rule.daysOfWeek : [current.day()])].sort(
      (a, b) => a - b,
    );
    const next = days.find((day) => day > current.day());
    candidate = next === undefined ? current.add(interval, 'week').day(days[0]) : current.day(next);
  }
  if (rule.frequency === 'monthly')
    candidate = current
      .add(interval, 'month')
      .date(
        Math.min(rule.dayOfMonth || current.date(), current.add(interval, 'month').daysInMonth()),
      );
  if (rule.frequency === 'yearly') candidate = current.add(interval, 'year');
  // Reparse wall-clock fields after calendar arithmetic so DST offset changes do not shift the cue.
  let result = dayjs.tz(candidate.format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm', zone).toDate();
  if (rule.startDate && result < new Date(rule.startDate)) result = new Date(rule.startDate);
  return rule.endDate && result > new Date(rule.endDate) ? null : result;
}
