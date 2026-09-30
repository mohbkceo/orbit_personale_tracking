import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import crypto from 'node:crypto';
import { createTask } from '../services/taskService.js';
import { createReminder } from '../services/reminders/reminderService.js';
import { createGoal } from '../services/goalService.js';
import { parseReminderCommand } from './reminderParser.js';
import { claimPending, clearPending, getPending, setPending } from './sessionService.js';
import { escapeHtml, localDate, rows } from './formatters.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const cancel = ['❌ Cancel', 'add:cancel'];
const dateOnly = (day) => new Date(`${day}T00:00:00.000Z`);
const validTitle = (value) => value.trim().length > 0 && value.trim().length <= 180;
const local = (zone, now = new Date()) => dayjs(now).tz(zone);
const dayAt = (day, clock, zone) => {
  const value = dayjs.tz(`${day} ${clock}`, 'YYYY-MM-DD HH:mm', zone);
  return value.format('YYYY-MM-DD HH:mm') === `${day} ${clock}` ? value.toDate() : null;
};
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value, 'YYYY-MM-DD', true).isValid();
const stale = () => ({ text: 'That action expired. Type add to start again.', stale: true });

export function stampGuidedReply(reply, flowId) {
  if (!flowId || !reply.markup?.inline_keyboard) return reply;
  return { ...reply, markup: { inline_keyboard: reply.markup.inline_keyboard.map((row) => row.map((button) => ({ ...button, callback_data: button.callback_data.startsWith('add:') ? `${button.callback_data}:${flowId}` : button.callback_data }))) } };
}

function dayChoice(choice, zone) {
  const now = local(zone);
  if (choice === 'today') return now.format('YYYY-MM-DD');
  if (choice === 'tomorrow') return now.add(1, 'day').format('YYYY-MM-DD');
  if (choice === '2days') return now.add(2, 'day').format('YYYY-MM-DD');
  if (choice === 'week') return now.add(1, 'week').format('YYYY-MM-DD');
  if (choice === 'thisweek') return now.endOf('week').format('YYYY-MM-DD');
  if (choice === 'month') return now.endOf('month').format('YYYY-MM-DD');
  return null;
}

const reminderWhen = () => ({ text: 'When should I remind you?', markup: rows([['In 30 min', 'add:remindwhen:30m'], ['In 1 hour', 'add:remindwhen:1h']], [['This evening', 'add:remindwhen:evening'], ['Tomorrow morning', 'add:remindwhen:morning']], [['Tomorrow evening', 'add:remindwhen:tomorrowevening']], [['📅 Choose date & time', 'add:remindday:choose']], [cancel]) });
const reminderDays = () => ({ text: 'Choose a day:', markup: rows([['Today', 'add:remindday:today'], ['Tomorrow', 'add:remindday:tomorrow']], [['In 2 days', 'add:remindday:2days'], ['In 1 week', 'add:remindday:week']], [['Other date', 'add:remindday:other']], [cancel]) });
const reminderTimes = () => ({ text: 'Choose a time:', markup: rows([['08:00', 'add:remindtime:0800'], ['09:00', 'add:remindtime:0900'], ['10:00', 'add:remindtime:1000']], [['12:00', 'add:remindtime:1200'], ['14:00', 'add:remindtime:1400'], ['16:00', 'add:remindtime:1600']], [['18:00', 'add:remindtime:1800'], ['20:00', 'add:remindtime:2000']], [['Other time', 'add:remindtime:other']], [cancel]) });
const taskPriorities = () => ({ text: 'Choose priority:', markup: rows([['🚨 Urgent', 'add:priority:urgent'], ['🔴 High', 'add:priority:high']], [['🟠 Medium', 'add:priority:medium'], ['🟢 Low', 'add:priority:low']], [cancel]) });
const taskDue = () => ({ text: 'When is it due?', markup: rows([['Today', 'add:taskdue:today'], ['Tomorrow', 'add:taskdue:tomorrow']], [['This week', 'add:taskdue:thisweek'], ['No deadline', 'add:taskdue:none']], [['📅 Choose date', 'add:taskdue:other']], [cancel]) });
const goalDue = () => ({ text: 'When do you want to achieve it?', markup: rows([['This week', 'add:goaldate:thisweek'], ['This month', 'add:goaldate:month']], [['No target date', 'add:goaldate:none'], ['📅 Choose date', 'add:goaldate:other']], [cancel]) });

async function finishReminder(identity, userId, payload, settings, date) {
  if (!date || date <= new Date()) return { text: 'Choose a future date and time.', markup: reminderWhen().markup };
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_REMINDER_WHEN', 'ADD_REMINDER_TIME', 'ADD_REMINDER_OTHER_TIME'], payload.flowId)) return stale();
  const reminder = await createReminder(userId, { title: payload.title, trigger: { type: 'datetime', at: date, timezone: settings.timezone }, deliveryChannels: ['telegram'] }, 'telegram');
  await clearPending(identity.userId, identity.chatId);
  return { text: `✅ Reminder created\n\n🔔 ${escapeHtml(reminder.title)}\n📅 ${localDate(reminder.nextTriggerAt, settings.timezone, 'ddd D MMM')}\n🕘 ${localDate(reminder.nextTriggerAt, settings.timezone, 'HH:mm')}` };
}

async function finishTask(identity, userId, payload, settings, day) {
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_TASK_DUE', 'ADD_TASK_OTHER_DATE'], payload.flowId)) return stale();
  const task = await createTask(userId, { title: payload.title, priority: payload.priority, dueDate: day ? dateOnly(day) : null, createdVia: 'telegram' });
  await clearPending(identity.userId, identity.chatId);
  return { text: `✅ Task added\n\n${escapeHtml(task.title)}\nPriority: ${task.priority[0].toUpperCase() + task.priority.slice(1)}\nDue: ${day ? localDate(dateOnly(day), 'UTC', 'ddd D MMM') : 'No deadline'}` };
}

async function finishGoal(identity, userId, payload, day) {
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_GOAL_DATE', 'ADD_GOAL_OTHER_DATE'], payload.flowId)) return stale();
  const goal = await createGoal(userId, { title: payload.title, type: 'personal', targetDate: day ? dateOnly(day) : null });
  await clearPending(identity.userId, identity.chatId);
  return { text: `✅ Goal added\n\n🎯 ${escapeHtml(goal.title)}\nTarget: ${day ? localDate(dateOnly(day), 'UTC', 'ddd D MMM') : 'No target date'}` };
}

export const isGuidedAdd = (pending) => pending?.action?.startsWith('ADD_');

export async function handleGuidedAddText(text, pending, userId, settings, identity) {
  const value = text.trim();
  if (['ADD_TASK_TITLE', 'ADD_REMINDER_TITLE', 'ADD_GOAL_TITLE'].includes(pending.action)) {
    if (!validTitle(value)) return { text: 'Send a title between 1 and 180 characters.' };
    if (pending.action === 'ADD_TASK_TITLE') { await setPending(identity.userId, identity.chatId, 'ADD_TASK_PRIORITY', { ...pending.payload, title: value }); return taskPriorities(); }
    if (pending.action === 'ADD_GOAL_TITLE') { await setPending(identity.userId, identity.chatId, 'ADD_GOAL_DATE', { ...pending.payload, title: value }); return goalDue(); }
    await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_WHEN', { ...pending.payload, title: value }); return reminderWhen();
  }
  if (pending.action === 'ADD_REMINDER_WHEN') {
    const parsed = parseReminderCommand(`${value} to ${pending.payload.title}`, { timezone: settings.timezone });
    if (parsed.intent !== 'CREATE_REMINDER') return { text: 'I could not understand that time. Try “tomorrow at 4” or choose a button.', markup: reminderWhen().markup };
    return finishReminder(identity, userId, pending.payload, settings, parsed.data.nextTriggerAt);
  }
  if (['ADD_REMINDER_OTHER_DATE', 'ADD_TASK_OTHER_DATE', 'ADD_GOAL_OTHER_DATE'].includes(pending.action)) {
    if (!validDay(value) || value < local(settings.timezone).format('YYYY-MM-DD')) return { text: 'Send a valid future date as YYYY-MM-DD.' };
    if (pending.action === 'ADD_REMINDER_OTHER_DATE') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_TIME', { ...pending.payload, day: value }); return reminderTimes(); }
    if (pending.action === 'ADD_TASK_OTHER_DATE') return finishTask(identity, userId, pending.payload, settings, value);
    return finishGoal(identity, userId, pending.payload, value);
  }
  if (pending.action === 'ADD_REMINDER_OTHER_TIME') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { text: 'Send a valid time as HH:mm, for example 16:30.' };
    const date = dayAt(pending.payload.day, value, settings.timezone);
    if (!date) return { text: 'That local time does not exist. Choose another time.' };
    return finishReminder(identity, userId, pending.payload, settings, date);
  }
  return { text: 'Use one of the buttons, or type cancel.' };
}

export async function handleGuidedAddAction(callback, userId, settings) {
  const parts = String(callback.data || '').split(':');
  const [, action] = parts;
  const choice = parts.length === 4 ? parts[2] : undefined;
  const identity = { userId: callback.from.id, chatId: callback.message.chat.id };
  if (['task', 'reminder', 'goal'].includes(action) && parts.length === 2) {
    await setPending(identity.userId, identity.chatId, `ADD_${action.toUpperCase()}_TITLE`, { flowId: crypto.randomBytes(4).toString('hex') });
    return { text: action === 'task' ? '✅ New Task\n\nWhat task do you want to add?' : action === 'reminder' ? '🔔 New Reminder\n\nWhat should I remind you about?' : '🎯 New Goal\n\nWhat is your goal?', markup: rows([cancel]) };
  }
  const pending = await getPending(identity.userId, identity.chatId);
  if (!isGuidedAdd(pending) || parts.at(-1) !== pending.payload.flowId) return stale();
  if (action === 'cancel') { await clearPending(identity.userId, identity.chatId); return { text: 'Cancelled.' }; }
  if (action === 'priority' && pending.action === 'ADD_TASK_PRIORITY' && ['urgent', 'high', 'medium', 'low'].includes(choice)) {
    await setPending(identity.userId, identity.chatId, 'ADD_TASK_DUE', { ...pending.payload, priority: choice }); return taskDue();
  }
  if (action === 'taskdue' && pending.action === 'ADD_TASK_DUE') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_TASK_OTHER_DATE', pending.payload); return { text: 'Send the due date as YYYY-MM-DD.', markup: rows([cancel]) }; }
    if (choice === 'none' || dayChoice(choice, settings.timezone)) return finishTask(identity, userId, pending.payload, settings, dayChoice(choice, settings.timezone));
  }
  if (action === 'goaldate' && pending.action === 'ADD_GOAL_DATE') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_GOAL_OTHER_DATE', pending.payload); return { text: 'Send the target date as YYYY-MM-DD.', markup: rows([cancel]) }; }
    if (choice === 'none' || dayChoice(choice, settings.timezone)) return finishGoal(identity, userId, pending.payload, dayChoice(choice, settings.timezone));
  }
  if (action === 'remindwhen' && pending.action === 'ADD_REMINDER_WHEN') {
    const when = { '30m': 'in 30 minutes', '1h': 'in 1 hour', evening: 'this evening', morning: 'tomorrow morning', tomorrowevening: 'tomorrow evening' }[choice];
    if (when) {
      const parsed = parseReminderCommand(`${when} to ${pending.payload.title}`, { timezone: settings.timezone });
      if (parsed.intent !== 'CREATE_REMINDER') return { text: 'That time has passed. Choose another time.', markup: reminderWhen().markup };
      return finishReminder(identity, userId, pending.payload, settings, parsed.data.nextTriggerAt);
    }
  }
  if (action === 'remindday' && pending.action === 'ADD_REMINDER_WHEN') {
    if (choice === 'choose') return reminderDays();
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_OTHER_DATE', pending.payload); return { text: 'Send the date as YYYY-MM-DD.', markup: rows([cancel]) }; }
    const day = dayChoice(choice, settings.timezone);
    if (day) { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_TIME', { ...pending.payload, day }); return reminderTimes(); }
  }
  if (action === 'remindtime' && pending.action === 'ADD_REMINDER_TIME') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_OTHER_TIME', pending.payload); return { text: 'Send the time as HH:mm.', markup: rows([cancel]) }; }
    if (/^([01]\d|2[0-3])[0-5]\d$/.test(choice || '')) return finishReminder(identity, userId, pending.payload, settings, dayAt(pending.payload.day, `${choice.slice(0, 2)}:${choice.slice(2)}`, settings.timezone));
  }
  return stale();
}
