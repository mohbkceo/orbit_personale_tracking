import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import mongoose from 'mongoose';
import { Debt } from '../models/Debt.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { updateTransaction } from '../services/financeService.js';
import { updateTask } from '../services/taskService.js';
import { checkAccess } from '../services/accessService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { consumeTelegramLink } from '../services/telegramLinkService.js';
import { snoozeReminder } from '../services/reminders/reminderService.js';
import { env } from '../config/env.js';
import { sendMessage, telegramRequest } from './botClient.js';
import { parseAmount, parseTelegramMessage } from './parser.js';
import { executeCommand, executeIntent, helpText, lastAction, paymentReply, quickMenu } from './commandHandlers.js';
import { handleCallbackAction } from './callbackHandlers.js';
import { handleReminderCallback } from './callbacks/reminderCallbacks.js';
import { clearPending, getPending, pendingExpired, setPending } from './sessionService.js';
import { escapeHtml as h } from './formatters.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
const aliases = { CREATE_TASK: 't', CREATE_RECEIVABLE: 'din', CREATE_PAYABLE: 'dout', CREATE_SALE: 's', CREATE_EXPENSE: 'e', CREATE_INCOME: 'i' };
const safeError = (error) => {
  if (/^Set a default (income|expense) account in Settings/.test(error.message)) return error.message;
  if (/^Amount must be greater than 0/.test(error.message)) return 'Amount must be greater than 0.';
  if (/exceeds the remaining balance/i.test(error.message)) return 'Payment exceeds the remaining balance.';
  if (/already paid/i.test(error.message)) return 'This debt is already paid.';
  if (/not found/i.test(error.message)) return 'That item is no longer available.';
  if (error.name === 'ValidationError' || error.name === 'CastError') return 'Please check the details and try again.';
  return 'I could not save that action. Please try again.';
};

async function pendingMessage(text, pending, userId, settings, identity) {
  if (pending.action === 'PAY_DEBT') {
    if (!mongoose.isValidObjectId(pending.payload.id)) return { text: 'That action expired. Please try again.', complete: true };
    const debt = await Debt.findOne({ _id: pending.payload.id, user: userId, archived: false });
    if (!debt) return { text: 'That debt is no longer available.', complete: true };
    const amount = parseAmount(text);
    if (!amount) return { text: 'Amount must be greater than 0.' };
    return { ...(await paymentReply(userId, debt, amount, settings)), complete: true };
  }
  if (pending.action === 'EDIT_TASK') {
    if (!mongoose.isValidObjectId(pending.payload.id)) return { text: 'That action expired. Please try again.', complete: true };
    const parsed = parseTelegramMessage(/^(?:t|task|todo)\s+/i.test(text) ? text : `t ${text}`, { timezone: settings.timezone });
    if (!parsed.data.title) return { text: 'Send the updated task title.' };
    const input = { title: parsed.data.title };
    if (/\b(today|tomorrow|yesterday|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)) input.dueDate = parsed.data.dueDate;
    if (/\b(?:\d{1,2}:\d{2}|\d{1,2}\s*[ap]m)\b/i.test(text)) input.dueTime = parsed.data.dueTime;
    if (/\b(low|medium|high|urgent)\b/i.test(text)) input.priority = parsed.data.priority;
    const item = await updateTask(userId, pending.payload.id, input);
    return { text: `✓ Task updated\n\n<b>${h(item.title)}</b>`, complete: true };
  }
  if (pending.action === 'EDIT_TX') {
    if (!mongoose.isValidObjectId(pending.payload.id)) return { text: 'That action expired. Please try again.', complete: true };
    const tx = await Transaction.findOne({ _id: pending.payload.id, user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } });
    if (!tx) return { text: 'That transaction is no longer available.', complete: true };
    const alias = tx.category === 'Sale' ? 's' : tx.type === 'expense' ? 'e' : 'i';
    const amountOnly = Boolean(parseAmount(text));
    const parsed = parseTelegramMessage(new RegExp(`^${alias}\\s`, 'i').test(text) ? text : `${alias} ${text}`);
    if (!parsed.data.amount) return { text: 'Amount must be greater than 0.' };
    const input = { amount: parsed.data.amount, description: amountOnly ? tx.description : parsed.data.description || tx.description };
    if (alias === 's' && !amountOnly) input.saleDetails = parsed.data.saleDetails;
    const item = await updateTransaction(userId, tx._id, input);
    return { text: `✓ ${tx.category === 'Sale' ? 'Sale' : 'Transaction'} updated\n\n<b>${h(item.description)}</b>`, complete: true };
  }
  if (aliases[pending.action]) {
    const prefix = aliases[pending.action];
    let parsed = parseTelegramMessage(new RegExp(`^${prefix}\\s`, 'i').test(text) ? text : `${prefix} ${text}`, { timezone: settings.timezone });
    if (pending.payload?.personName && parseAmount(text)) {
      parsed = { intent: pending.action, data: { ...pending.payload, originalAmount: parseAmount(text) } };
    } else if (pending.payload?.amount && !parsed.data.amount && ['CREATE_INCOME', 'CREATE_EXPENSE'].includes(pending.action)) {
      parsed = { intent: pending.action, data: { ...pending.payload, description: text.trim() } };
    }
    const reply = await executeIntent(userId, parsed, settings, identity);
    return { ...reply, complete: !reply.pending };
  }
  return { text: 'That action expired. Please try again.', complete: true };
}

async function dispatchMessage(text, userId, settings, identity) {
  const command = text.trim().toLowerCase().split(/\s+/)[0];
  if (['/cancel', 'cancel'].includes(text.toLowerCase())) { await clearPending(identity.userId, identity.chatId); return { text: 'Cancelled.' }; }
  if (['/quick', '/add'].includes(command)) { await clearPending(identity.userId, identity.chatId); return quickMenu(); }
  if (['/start', '/menu', '/help'].includes(command)) return { text: helpText() };
  if (command === '/last') return lastAction(userId, settings);
  if (command === '/undo' || command === 'undo') return lastAction(userId, settings, true);
  const snooze = text.match(/^\/snooze\s+([a-f\d]{24})\s+(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/i);
  if (snooze) {
    const until = dayjs.tz(`${snooze[2]} ${snooze[3]}:${snooze[4]}`, 'YYYY-MM-DD HH:mm', settings.timezone);
    if (until.format('YYYY-MM-DD HH:mm') !== `${snooze[2]} ${snooze[3]}:${snooze[4]}`) return { text: 'That local date or time does not exist. Choose another time.' };
    const reminder = await snoozeReminder(userId, snooze[1], until.toDate(), 'telegram');
    return { text: `⏰ Snoozed <b>${h(reminder.title)}</b> until ${until.format('D MMM HH:mm')}` };
  }
  const debtPay = text.match(/^\/debtpay\s+([a-f\d]{24})\s+(.+)$/i);
  if (debtPay) {
    const debt = await Debt.findOne({ _id: debtPay[1], user: userId, archived: false });
    return debt ? paymentReply(userId, debt, parseAmount(debtPay[2]), settings) : { text: 'Debt not found.' };
  }
  const existing = await executeCommand(userId, command, settings);
  if (existing) return existing;
  const pending = await getPending(identity.userId, identity.chatId);
  const direct = parseTelegramMessage(text, { timezone: settings.timezone });
  const interruptsPending = ['CANCEL_REMINDER', 'UPDATE_REMINDER'].includes(direct.intent) || (!['EDIT_TASK', 'EDIT_TX'].includes(pending?.action) && /^(CREATE_|RECORD_)/.test(direct.intent));
  if (pending && interruptsPending) {
    await clearPending(identity.userId, identity.chatId);
    const reply = await executeIntent(userId, direct, settings, identity);
    if (reply.pending) await setPending(identity.userId, identity.chatId, reply.pending.action, reply.pending.payload);
    return reply;
  }
  if (pending && !text.startsWith('/')) {
    const reply = await pendingMessage(text, pending, userId, settings, identity);
    if (reply.complete) await clearPending(identity.userId, identity.chatId);
    if (reply.pending) await setPending(identity.userId, identity.chatId, reply.pending.action, reply.pending.payload);
    return reply;
  }
  if (await pendingExpired(identity.userId, identity.chatId) && direct.intent === 'UNKNOWN') return { text: 'That action expired. Please try again.' };
  const reply = await executeIntent(userId, direct, settings, identity);
  if (reply.pending) await setPending(identity.userId, identity.chatId, reply.pending.action, reply.pending.payload);
  return reply;
}

export async function handleTelegramUpdate(update) {
  const token = env.ORBIT_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const message = update.message;
  const callback = update.callback_query;
  const from = message?.from || callback?.from;
  const chat = message?.chat || callback?.message?.chat;
  if (!from?.id || !chat?.id || chat.type && chat.type !== 'private') return;
  const chatId = chat.id;
  const text = String(message?.text || '').trim();
  if (text.startsWith('/start ')) {
    try {
      const linked = await consumeTelegramLink(text.slice(7).trim(), { id: from.id, username: from.username, chatId });
      linked.lastInteractionAt = new Date();
      linked.lastUpdateAt = new Date();
      await linked.save();
      return sendMessage(token, chatId, '✓ Your Telegram account is now connected to Orbit.');
    } catch { return sendMessage(token, chatId, 'This connection link is invalid or expired. Create a new link in Orbit Settings.'); }
  }
  const connection = await TelegramConnection.findOne({ telegramUserId: String(from.id), chatId: String(chatId) });
  if (!connection) return;
  connection.lastInteractionAt = new Date();
  connection.lastUpdateAt = new Date();
  await connection.save();
  const user = await User.findById(connection.user);
  if (!user || !(await checkAccess(user)).eligible) return;
  const settings = await getSettingsDocument(user._id);
  const identity = { userId: from.id, chatId };
  if (callback) {
    if (String(callback.data).startsWith('r:')) {
      try { return await handleReminderCallback(callback, user._id, token, settings); }
      catch (error) { console.error('Telegram reminder callback failed:', error.message); await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: safeError(error), show_alert: true }); return; }
    }
    try {
      const reply = await handleCallbackAction(callback, user._id, settings);
      await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: reply.answer || 'Done' });
      if (reply.removeMarkup) await telegramRequest(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } });
      if (reply.text) await sendMessage(token, chatId, reply.text, reply.markup);
    } catch (error) {
      console.error('Telegram callback failed:', { userId: String(user._id), action: String(callback.data).split(':').slice(0, 2).join(':'), message: error.message });
      await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: safeError(error), show_alert: true });
    }
    return;
  }
  if (!text) return;
  try {
    const reply = await dispatchMessage(text, user._id, settings, identity);
    return sendMessage(token, chatId, reply.text, reply.markup);
  } catch (error) {
    console.error('Telegram message failed:', { userId: String(user._id), message: error.message });
    return sendMessage(token, chatId, safeError(error));
  }
}
