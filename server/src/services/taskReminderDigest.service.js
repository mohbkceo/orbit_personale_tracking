import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { Task } from '../models/Task.js';
import { escapeHtml } from '../telegram/formatters.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const priorities = [
  ['urgent', '🚨 Urgent'],
  ['high', '🔴 High'],
  ['medium', '🟠 Medium'],
  ['low', '🟢 Low'],
];

export function sortDigestTasks(tasks, zone, now = new Date()) {
  const today = dayjs(now).tz(zone).format('YYYY-MM-DD');
  const dueDay = (task) => task.dueDate ? dayjs.utc(task.dueDate).format('YYYY-MM-DD') : null;
  const band = (task) => !dueDay(task) ? 3 : dueDay(task) < today ? 0 : dueDay(task) === today ? 1 : 2;
  const rank = Object.fromEntries(priorities.map(([key], index) => [key, index]));
  return [...tasks].sort((a, b) =>
    (rank[a.priority] ?? 4) - (rank[b.priority] ?? 4) ||
    band(a) - band(b) ||
    (band(a) === 0 ? (dueDay(b) || '').localeCompare(dueDay(a) || '') : (dueDay(a) || '').localeCompare(dueDay(b) || '')) ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
    String(a._id).localeCompare(String(b._id)));
}

export async function collectTaskDigest(userId, rules, zone, now = new Date()) {
  const policy = rules.taskReminderDigest;
  if (!policy?.enabled) return [];
  const query = { user: userId, archived: false, status: { $in: ['todo', 'in_progress'] }, reminderMode: { $nin: ['custom', 'off'] }, taskReminderState: { $ne: 'muted' } };
  if (!policy.includeNoDueDate) query.dueDate = { $ne: null };
  const tasks = await Task.find(query).lean();
  return sortDigestTasks(tasks.filter((task) => policy.priorities[task.priority] !== false), zone, now).slice(0, policy.maxTasks);
}

export function renderTaskDigest(tasks) {
  if (!tasks.length) return null;
  let number = 0;
  const shown = [];
  let length = 20;
  const sections = priorities.map(([priority, heading]) => {
    const items = tasks.filter((task) => task.priority === priority);
    if (!items.length) return null;
    const lines = [];
    for (const task of items) {
      const line = `${String(number + 1).padStart(2, '0')} — ${escapeHtml(task.title.slice(0, 65))}`;
      const extra = line.length + (lines.length ? 1 : heading.length + 10);
      if (length + extra > 3900) break;
      length += extra;
      number += 1;
      shown.push(task);
      lines.push(line);
    }
    return lines.length ? `<b>${heading}</b>\n${lines.join('\n')}` : null;
  }).filter(Boolean);
  if (!shown.length) return null;
  const keyboard = [];
  for (let index = 0; index < shown.length; index += 4) {
    keyboard.push(shown.slice(index, index + 4).map((task, offset) => ({ text: String(index + offset + 1).padStart(2, '0'), callback_data: `taskdigest:select:${task._id}` })));
  }
  return { text: `📋 <b>Tasks</b>\n\n${sections.join('\n\n')}`, markup: { inline_keyboard: keyboard } };
}

export function digestNumber(tasks, id) {
  const index = tasks.findIndex((task) => String(task._id) === String(id));
  return index < 0 ? null : String(index + 1).padStart(2, '0');
}
