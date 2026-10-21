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
import { telegramText as tr } from '../i18n/telegram.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const cancel = (settings) => [tr(settings, 'cancelIcon'), 'add:cancel'];
const dateOnly = (day) => new Date(`${day}T00:00:00.000Z`);
const validTitle = (value) => value.trim().length > 0 && value.trim().length <= 180;
const local = (zone, now = new Date()) => dayjs(now).tz(zone);
const dayAt = (day, clock, zone) => {
  const value = dayjs.tz(`${day} ${clock}`, 'YYYY-MM-DD HH:mm', zone);
  return value.format('YYYY-MM-DD HH:mm') === `${day} ${clock}` ? value.toDate() : null;
};
const validDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value, 'YYYY-MM-DD', true).isValid();
const stale = (settings) => ({ text: tr(settings, 'guidedStale'), stale: true });

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

const reminderWhen = (settings) => ({ text: tr(settings, 'whenRemind'), markup: rows([[tr(settings, 'inThirty'), 'add:remindwhen:30m'], [tr(settings, 'inHour'), 'add:remindwhen:1h']], [[tr(settings, 'thisEvening'), 'add:remindwhen:evening'], [tr(settings, 'tomorrowMorning'), 'add:remindwhen:morning']], [[tr(settings, 'tomorrowEvening'), 'add:remindwhen:tomorrowevening']], [[tr(settings, 'chooseDateTime'), 'add:remindday:choose']], [cancel(settings)]) });
const reminderDays = (settings) => ({ text: tr(settings, 'chooseDay'), markup: rows([[tr(settings, 'today'), 'add:remindday:today'], [tr(settings, 'tomorrow'), 'add:remindday:tomorrow']], [[tr(settings, 'inTwoDays'), 'add:remindday:2days'], [tr(settings, 'inWeek'), 'add:remindday:week']], [[tr(settings, 'otherDate'), 'add:remindday:other']], [cancel(settings)]) });
const reminderTimes = (settings) => ({ text: tr(settings, 'chooseTimePrompt'), markup: rows([['08:00', 'add:remindtime:0800'], ['09:00', 'add:remindtime:0900'], ['10:00', 'add:remindtime:1000']], [['12:00', 'add:remindtime:1200'], ['14:00', 'add:remindtime:1400'], ['16:00', 'add:remindtime:1600']], [['18:00', 'add:remindtime:1800'], ['20:00', 'add:remindtime:2000']], [[tr(settings, 'otherTime'), 'add:remindtime:other']], [cancel(settings)]) });
const taskPriorities = (settings) => ({ text: tr(settings, 'choosePriority'), markup: rows([[`🚨 ${tr(settings, 'priorityUrgent')}`, 'add:priority:urgent'], [`🔴 ${tr(settings, 'priorityHigh')}`, 'add:priority:high']], [[`🟠 ${tr(settings, 'priorityMedium')}`, 'add:priority:medium'], [`🟢 ${tr(settings, 'priorityLow')}`, 'add:priority:low']], [cancel(settings)]) });
const taskDue = (settings) => ({ text: tr(settings, 'whenDue'), markup: rows([[tr(settings, 'today'), 'add:taskdue:today'], [tr(settings, 'tomorrow'), 'add:taskdue:tomorrow']], [[tr(settings, 'thisWeek'), 'add:taskdue:thisweek'], [tr(settings, 'noDeadline'), 'add:taskdue:none']], [[tr(settings, 'chooseDateIcon'), 'add:taskdue:other']], [cancel(settings)]) });
const goalDue = (settings) => ({ text: tr(settings, 'goalDuePrompt'), markup: rows([[tr(settings, 'thisWeek'), 'add:goaldate:thisweek'], [tr(settings, 'thisMonth'), 'add:goaldate:month']], [[tr(settings, 'noTargetDate'), 'add:goaldate:none'], [tr(settings, 'chooseDateIcon'), 'add:goaldate:other']], [cancel(settings)]) });

async function finishReminder(identity, userId, payload, settings, date) {
  if (!date || date <= new Date()) return { text: tr(settings, 'futureDateTime'), markup: reminderWhen(settings).markup };
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_REMINDER_WHEN', 'ADD_REMINDER_TIME', 'ADD_REMINDER_OTHER_TIME'], payload.flowId)) return stale(settings);
  const reminder = await createReminder(userId, { title: payload.title, trigger: { type: 'datetime', at: date, timezone: settings.timezone }, deliveryChannels: ['telegram'] }, 'telegram');
  await clearPending(identity.userId, identity.chatId);
  return { text: `${tr(settings, 'reminderCreated')}\n\n🔔 ${escapeHtml(reminder.title)}\n📅 ${localDate(reminder.nextTriggerAt, settings.timezone, 'ddd D MMM', settings.language)}\n🕘 ${localDate(reminder.nextTriggerAt, settings.timezone, 'HH:mm', settings.language)}` };
}

async function finishTask(identity, userId, payload, settings, day) {
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_TASK_DUE', 'ADD_TASK_OTHER_DATE'], payload.flowId)) return stale(settings);
  const task = await createTask(userId, { title: payload.title, priority: payload.priority, dueDate: day ? dateOnly(day) : null, createdVia: 'telegram' });
  await clearPending(identity.userId, identity.chatId);
  return { text: `✅ ${tr(settings, 'taskAdded')}\n\n${escapeHtml(task.title)}\n${tr(settings, 'digestPriority')}: ${tr(settings, `priority${task.priority[0].toUpperCase()}${task.priority.slice(1)}`)}\n${tr(settings, 'digestDue')}: ${day ? localDate(dateOnly(day), 'UTC', 'ddd D MMM', settings.language) : tr(settings, 'noDeadline')}` };
}

async function finishGoal(identity, userId, payload, settings, day) {
  if (!await claimPending(identity.userId, identity.chatId, ['ADD_GOAL_DATE', 'ADD_GOAL_OTHER_DATE'], payload.flowId)) return stale(settings);
  const goal = await createGoal(userId, { title: payload.title, type: 'personal', targetDate: day ? dateOnly(day) : null });
  await clearPending(identity.userId, identity.chatId);
  return { text: `${tr(settings, 'goalAdded')}\n\n🎯 ${escapeHtml(goal.title)}\n${tr(settings, 'target')}: ${day ? localDate(dateOnly(day), 'UTC', 'ddd D MMM', settings.language) : tr(settings, 'noTargetDate')}` };
}

export const isGuidedAdd = (pending) => pending?.action?.startsWith('ADD_');

export async function handleGuidedAddText(text, pending, userId, settings, identity) {
  const value = text.trim();
  if (['ADD_TASK_TITLE', 'ADD_REMINDER_TITLE', 'ADD_GOAL_TITLE'].includes(pending.action)) {
    if (!validTitle(value)) return { text: tr(settings, 'titleLength') };
    if (pending.action === 'ADD_TASK_TITLE') { await setPending(identity.userId, identity.chatId, 'ADD_TASK_PRIORITY', { ...pending.payload, title: value }); return taskPriorities(settings); }
    if (pending.action === 'ADD_GOAL_TITLE') { await setPending(identity.userId, identity.chatId, 'ADD_GOAL_DATE', { ...pending.payload, title: value }); return goalDue(settings); }
    await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_WHEN', { ...pending.payload, title: value }); return reminderWhen(settings);
  }
  if (pending.action === 'ADD_REMINDER_WHEN') {
    const parsed = parseReminderCommand(`${value} to ${pending.payload.title}`, { timezone: settings.timezone });
    if (parsed.intent !== 'CREATE_REMINDER') return { text: tr(settings, 'timeNotUnderstood'), markup: reminderWhen(settings).markup };
    return finishReminder(identity, userId, pending.payload, settings, parsed.data.nextTriggerAt);
  }
  if (['ADD_REMINDER_OTHER_DATE', 'ADD_TASK_OTHER_DATE', 'ADD_GOAL_OTHER_DATE'].includes(pending.action)) {
    if (!validDay(value) || value < local(settings.timezone).format('YYYY-MM-DD')) return { text: tr(settings, 'validFutureDate') };
    if (pending.action === 'ADD_REMINDER_OTHER_DATE') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_TIME', { ...pending.payload, day: value }); return reminderTimes(settings); }
    if (pending.action === 'ADD_TASK_OTHER_DATE') return finishTask(identity, userId, pending.payload, settings, value);
    return finishGoal(identity, userId, pending.payload, settings, value);
  }
  if (pending.action === 'ADD_REMINDER_OTHER_TIME') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { text: tr(settings, 'validTime') };
    const date = dayAt(pending.payload.day, value, settings.timezone);
    if (!date) return { text: tr(settings, 'localTimeInvalid') };
    return finishReminder(identity, userId, pending.payload, settings, date);
  }
  return { text: tr(settings, 'buttonsOrCancel') };
}

export async function handleGuidedAddAction(callback, userId, settings) {
  const parts = String(callback.data || '').split(':');
  const [, action] = parts;
  const choice = parts.length === 4 ? parts[2] : undefined;
  const identity = { userId: callback.from.id, chatId: callback.message.chat.id };
  if (['task', 'reminder', 'goal'].includes(action) && parts.length === 2) {
    await setPending(identity.userId, identity.chatId, `ADD_${action.toUpperCase()}_TITLE`, { flowId: crypto.randomBytes(4).toString('hex') });
    return { text: tr(settings, action === 'task' ? 'newTaskPrompt' : action === 'reminder' ? 'newReminderPrompt' : 'newGoalPrompt'), markup: rows([cancel(settings)]) };
  }
  const pending = await getPending(identity.userId, identity.chatId);
  if (!isGuidedAdd(pending) || parts.at(-1) !== pending.payload.flowId) return stale(settings);
  if (action === 'cancel') { await clearPending(identity.userId, identity.chatId); return { text: tr(settings, 'cancelledReply') }; }
  if (action === 'priority' && pending.action === 'ADD_TASK_PRIORITY' && ['urgent', 'high', 'medium', 'low'].includes(choice)) {
    await setPending(identity.userId, identity.chatId, 'ADD_TASK_DUE', { ...pending.payload, priority: choice }); return taskDue(settings);
  }
  if (action === 'taskdue' && pending.action === 'ADD_TASK_DUE') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_TASK_OTHER_DATE', pending.payload); return { text: tr(settings, 'dueDateInput'), markup: rows([cancel(settings)]) }; }
    if (choice === 'none' || dayChoice(choice, settings.timezone)) return finishTask(identity, userId, pending.payload, settings, dayChoice(choice, settings.timezone));
  }
  if (action === 'goaldate' && pending.action === 'ADD_GOAL_DATE') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_GOAL_OTHER_DATE', pending.payload); return { text: tr(settings, 'targetDateInput'), markup: rows([cancel(settings)]) }; }
    if (choice === 'none' || dayChoice(choice, settings.timezone)) return finishGoal(identity, userId, pending.payload, settings, dayChoice(choice, settings.timezone));
  }
  if (action === 'remindwhen' && pending.action === 'ADD_REMINDER_WHEN') {
    const when = { '30m': 'in 30 minutes', '1h': 'in 1 hour', evening: 'this evening', morning: 'tomorrow morning', tomorrowevening: 'tomorrow evening' }[choice];
    if (when) {
      const parsed = parseReminderCommand(`${when} to ${pending.payload.title}`, { timezone: settings.timezone });
      if (parsed.intent !== 'CREATE_REMINDER') return { text: tr(settings, 'timePassed'), markup: reminderWhen(settings).markup };
      return finishReminder(identity, userId, pending.payload, settings, parsed.data.nextTriggerAt);
    }
  }
  if (action === 'remindday' && pending.action === 'ADD_REMINDER_WHEN') {
    if (choice === 'choose') return reminderDays(settings);
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_OTHER_DATE', pending.payload); return { text: tr(settings, 'dateInput'), markup: rows([cancel(settings)]) }; }
    const day = dayChoice(choice, settings.timezone);
    if (day) { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_TIME', { ...pending.payload, day }); return reminderTimes(settings); }
  }
  if (action === 'remindtime' && pending.action === 'ADD_REMINDER_TIME') {
    if (choice === 'other') { await setPending(identity.userId, identity.chatId, 'ADD_REMINDER_OTHER_TIME', pending.payload); return { text: tr(settings, 'timeInput'), markup: rows([cancel(settings)]) }; }
    if (/^([01]\d|2[0-3])[0-5]\d$/.test(choice || '')) return finishReminder(identity, userId, pending.payload, settings, dayAt(pending.payload.day, `${choice.slice(0, 2)}:${choice.slice(2)}`, settings.timezone));
  }
  return stale(settings);
}
