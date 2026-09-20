import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function readTime(value) {
  const match =
    value.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
    value.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i) ||
    value.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] && /^\d+$/.test(match[2]) ? match[2] : 0);
  const meridiem = match[3] || (match[2] && /^(am|pm)$/i.test(match[2]) ? match[2] : null);
  if (meridiem) hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  if (hour > 23 || minute > 59) return null;
  return {
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    rest: value.replace(match[0], '').trim(),
  };
}

function futureWeekday(local, index) {
  let offset = (index - local.day() + 7) % 7;
  if (offset === 0) offset += 7;
  return local.add(offset, 'day');
}

export function parseReminderCommand(
  text,
  { now = new Date(), timezone: zone = 'Africa/Algiers' } = {},
) {
  const input = text.trim();
  const split = input.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!split) return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
  let when = split[1].toLowerCase().trim();
  const title = split[2].trim();
  if (!title || title.length > 180)
    return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
  const local = dayjs(now).tz(zone);
  let target;
  let recurrence;
  const relative = when.match(/^in\s+(\d+)\s+(minutes?|hours?|days?)$/);
  if (relative) {
    const amount = Number(relative[1]);
    if (amount < 1 || amount > 365)
      return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
    target = local.add(
      amount,
      relative[2].startsWith('minute') ? 'minute' : relative[2].startsWith('hour') ? 'hour' : 'day',
    );
  } else {
    const explicit = readTime(when);
    if (explicit) when = explicit.rest;
    let time = explicit?.time || '09:00';
    if (when === 'tonight' || when === 'this evening') {
      when = 'today';
      if (!explicit) time = '19:00';
    }
    if (when === 'this afternoon') {
      when = 'today';
      if (!explicit) time = '15:00';
    }
    let day;
    if (when === 'today') day = local;
    else if (when === 'tomorrow') day = local.add(1, 'day');
    else {
      const weekly = when.match(
        /^every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
      );
      const weekday = when.match(
        /^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
      );
      const month = when.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
      if (weekly) {
        day = futureWeekday(local, weekdays.indexOf(weekly[1]));
        recurrence = {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [weekdays.indexOf(weekly[1])],
        };
      } else if (weekday) day = futureWeekday(local, weekdays.indexOf(weekday[2]));
      else if (month && months.includes(month[1])) {
        const monthNumber = months.indexOf(month[1]) + 1;
        const year = Number(month[3] || local.year());
        const textDate = `${year}-${String(monthNumber).padStart(2, '0')}-${String(Number(month[2])).padStart(2, '0')}`;
        const parsed = dayjs.tz(`${textDate} ${time}`, 'YYYY-MM-DD HH:mm', zone);
        if (parsed.format('YYYY-MM-DD') !== textDate)
          return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
        day = parsed;
        if (!month[3] && day.isBefore(local)) day = day.add(1, 'year');
      }
    }
    if (!day) return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
    target = dayjs.tz(`${day.format('YYYY-MM-DD')} ${time}`, 'YYYY-MM-DD HH:mm', zone);
  }
  if (!target.isValid() || !target.isAfter(local))
    return { intent: 'CLARIFY_REMINDER', confidence: 0.3, data: {} };
  return {
    intent: 'CREATE_REMINDER',
    confidence: 0.98,
    data: {
      title,
      trigger: {
        type: recurrence ? 'recurring' : 'datetime',
        at: target.toDate(),
        timezone: zone,
        ...(recurrence ? { recurrence } : {}),
      },
      nextTriggerAt: target.toDate(),
    },
  };
}
