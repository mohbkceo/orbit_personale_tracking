import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import mongoose from 'mongoose';
import {
  cancelReminder,
  getReminder,
  completeReminder,
  markReminderBlocked,
  resumeReminder,
  snoozeReminder,
} from '../../services/reminders/reminderService.js';
import { recordDebtPayment } from '../../services/debtService.js';
import { payBill } from '../../services/billService.js';
import { Debt } from '../../models/Debt.js';
import { telegramRequest } from '../botClient.js';
import { AppError } from '../../utils/AppError.js';
import { resolveTelegramAccount } from '../accountResolver.js';
import { escapeHtml } from '../formatters.js';
import { executeTask } from '../../services/taskExecution.service.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const row = (...buttons) => buttons.map(([text, data]) => ({ text, callback_data: data }));

async function edit(callback, token, text, rows = []) {
  return telegramRequest(token, 'editMessageText', {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: rows },
  });
}

export async function handleReminderCallback(callback, userId, token, settings) {
  const parts = String(callback.data || '').split(':');
  const id = parts.at(-1);
  if (parts[0] !== 'r' || !mongoose.isValidObjectId(id))
    throw new AppError('Invalid reminder action', 400);
  if (parts[1] === 'edit') {
    await telegramRequest(token, 'answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Open Reminders in Orbit to edit this task’s plan.',
    });
    return;
  }
  const reminder = await getReminder(userId, id);
  const action = parts[1];
  const taskAutomation = reminder.entityType === 'task' && Boolean(reminder.metadata?.automation);
  if (taskAutomation && ['start', 'continue', 'stop', 'backlog', 'drop'].includes(action)) {
    await executeTask(userId, reminder.entityId, action, { channel: 'telegram', reminderId: id });
    await edit(callback, token, `${action === 'start' ? '▶️ Started' : action === 'continue' ? '↻ Continuing' : action === 'drop' ? 'Dropped' : action === 'backlog' ? 'Returned to backlog' : 'Stopped for now'}\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (taskAutomation && action === 'notime') {
    await executeTask(userId, reminder.entityId, 'later', { channel: 'telegram', reminderId: id, reason: 'no_time' });
    await edit(callback, token, `⏰ Snoozed\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (taskAutomation && action === 'notimportant') {
    await executeTask(userId, reminder.entityId, 'backlog', { channel: 'telegram', reminderId: id });
    await edit(callback, token, `Returned to backlog\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (taskAutomation && action === 'date') {
    await edit(callback, token, `Send <code>/taskdate ${reminder.entityId} YYYY-MM-DD</code> to choose a date.\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (taskAutomation && action === 'next') {
    await edit(callback, token, `Send <code>/nextaction ${reminder.entityId} your concrete next step</code>.\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else
  if (action === 'cancel') {
    await cancelReminder(userId, id, 'telegram');
    await edit(callback, token, `Cancelled\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (action === 'later') {
    await edit(
      callback,
      token,
      `⏰ When should I remind you again?\n\n<b>${escapeHtml(reminder.title)}</b>`,
      [
        row(['30 min', `r:s30:${id}`], ['2 hours', `r:s120:${id}`]),
        row(['This evening', `r:sevening:${id}`], ['Tomorrow', `r:stomorrow:${id}`]),
        row(['Choose time', `r:choose:${id}`]),
      ],
    );
  } else if (['s30', 's120', 'sevening', 'stomorrow'].includes(action)) {
    const local = dayjs().tz(settings.timezone);
    const until =
      action === 's30'
        ? local.add(30, 'minute')
        : action === 's120'
          ? local.add(2, 'hour')
          : action === 'stomorrow'
            ? local.add(1, 'day').hour(9).minute(0)
            : local.hour(18).minute(0);
    const future = until.isAfter(local) ? until : until.add(1, 'day');
    if (taskAutomation) await executeTask(userId, reminder.entityId, 'later', { channel: 'telegram', reminderId: id, until: future.toDate() });
    else await snoozeReminder(userId, id, future.toDate(), 'telegram');
    await edit(
      callback,
      token,
      `⏰ Snoozed until ${future.format('ddd, D MMM HH:mm')}\n\n<b>${escapeHtml(reminder.title)}</b>`,
    );
  } else if (action === 'choose') {
    await edit(
      callback,
      token,
      `Send <code>/snooze ${id} YYYY-MM-DD HH:mm</code> in your Orbit timezone.\n\n<b>${escapeHtml(reminder.title)}</b>`,
    );
  } else if (action === 'block') {
    await edit(callback, token, `⛔ What's blocking <b>${escapeHtml(reminder.title)}</b>?`, [
      row(['Waiting for info', `r:binfo:${id}`], ['Waiting for someone', `r:bsomeone:${id}`]),
      row(['Not enough time', `r:btime:${id}`], ['Other', `r:bother:${id}`]),
    ]);
  } else if (['binfo', 'bsomeone', 'btime', 'bother'].includes(action)) {
    const reason = {
      binfo: 'waiting_for_info',
      bsomeone: 'waiting_for_someone',
      btime: 'not_enough_time',
      bother: 'other',
    }[action];
    if (taskAutomation) await executeTask(userId, reminder.entityId, 'blocked', { channel: 'telegram', reminderId: id, reason });
    else await markReminderBlocked(userId, id, reason, '', 'telegram');
    await edit(callback, token, `⏸ Waiting\n\n<b>${escapeHtml(reminder.title)}</b>`, [
      row(['Remind tomorrow', `r:stomorrow:${id}`], ['Resume', `r:resume:${id}`]),
    ]);
  } else if (action === 'resume') {
    await resumeReminder(userId, id, new Date(), 'telegram');
    if (taskAutomation) await executeTask(userId, reminder.entityId, 'resume', { channel: 'telegram', reminderId: id });
    await edit(callback, token, `▶️ Resumed\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (action === 'done') {
    if (taskAutomation) await executeTask(userId, reminder.entityId, 'done', { channel: 'telegram', reminderId: id });
    else await completeReminder(userId, id, 'telegram');
    await edit(callback, token, `✓ Done\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (action === 'paid') {
    if (reminder.entityType === 'debt') {
      const debt = await Debt.findOne({ _id: reminder.entityId, user: userId });
      if (!debt) throw new AppError('Debt not found', 404);
      const account = await resolveTelegramAccount(userId, settings, debt.type === 'receivable' ? 'in' : 'out', debt.currency);
      if (account.error) throw new AppError(account.error, 400);
      await recordDebtPayment(userId, debt._id, {
        amount: debt.remainingAmount,
        accountId: account.accountId,
        createdVia: 'telegram',
      });
    } else if (reminder.entityType === 'bill') {
      const account = await resolveTelegramAccount(userId, settings, 'out');
      if (account.error) throw new AppError(account.error, 400);
      await payBill(userId, reminder.entityId, {
        accountId: account.accountId,
        createdVia: 'telegram',
      });
    } else throw new AppError('Invalid payment action', 400);
    await edit(callback, token, `✓ Payment recorded\n\n<b>${escapeHtml(reminder.title)}</b>`);
  } else if (action === 'partial' && reminder.entityType === 'debt') {
    await edit(
      callback,
      token,
      `Send <code>/debtpay ${reminder.entityId} AMOUNT</code> to record a partial payment.\n\n<b>${escapeHtml(reminder.title)}</b>`,
    );
  } else if (action === 'progress' && reminder.entityType === 'goal') {
    await edit(
      callback,
      token,
      `Open Goals &amp; savings in Orbit to add progress. This review stays open until you skip or complete it.\n\n<b>${escapeHtml(reminder.title)}</b>`,
      [row(['Skip review', `r:done:${id}`], ['Later', `r:later:${id}`])],
    );
  } else if (action === 'nexttask' && reminder.entityType === 'goal') {
    await edit(
      callback,
      token,
      `Send <code>task your next action tomorrow</code> to capture one concrete step.\n\n<b>${escapeHtml(reminder.title)}</b>`,
      [row(['Skip review', `r:done:${id}`], ['Later', `r:later:${id}`])],
    );
  } else throw new AppError('Unknown reminder action', 400);
  await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id });
}
