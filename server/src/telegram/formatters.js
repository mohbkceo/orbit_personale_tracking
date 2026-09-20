import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
export const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export const money = (amount, currency = 'DZD') => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)} ${currency === 'DZD' ? 'DA' : escapeHtml(currency)}`;
export const rows = (...buttons) => ({ inline_keyboard: buttons.map((line) => line.map(([text, callback_data]) => ({ text, callback_data }))) });
export const localDay = (date, zone) => dayjs(date).tz(zone || 'Africa/Algiers').format('YYYY-MM-DD');
export const localDate = (date, zone, format = 'ddd, D MMM') => dayjs(date).tz(zone || 'Africa/Algiers').format(format);
export function taskDue(task, zone) {
  if (!task.dueDate) return '';
  const date = localDay(task.dueDate, 'UTC');
  const today = localDay(new Date(), zone);
  const tomorrow = dayjs().tz(zone).add(1, 'day').format('YYYY-MM-DD');
  return `${date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : dayjs(date).format('ddd, D MMM')}${task.dueTime ? ` · ${task.dueTime}` : ''}`;
}
