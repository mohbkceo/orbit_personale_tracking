import dayjs from 'dayjs';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { accountBalances, archiveTransaction, createTransaction } from '../services/financeService.js';
import { createDebt, recordDebtPayment } from '../services/debtService.js';
import { createTask, updateTask } from '../services/taskService.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { checkAccess } from '../services/accessService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { consumeTelegramLink } from '../services/telegramLinkService.js';
import { env } from '../config/env.js';
import { sendMessage, telegramRequest } from './botClient.js';
import { parseTelegramMessage } from './parser.js';

const money = (amount, currency = 'DZD') => new Intl.NumberFormat('en-DZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const keyboard = (...buttons) => ({ inline_keyboard: [buttons.map(([text, callback_data]) => ({ text, callback_data }))] });

async function summaries(userId, intent) {
  const summary = await dashboardSummary(userId);
  if (intent === 'SHOW_MONEY') return `<b>Money</b>\n\nTotal balance: ${money(summary.money.totalBalance)}\nThis month: +${money(summary.money.income)} / −${money(summary.money.expenses)}\nNet: ${money(summary.money.net)}`;
  if (intent === 'SHOW_DEBTS') return `<b>Debts</b>\n\nOwed to you: ${money(summary.debts.receivable)}\nYou owe: ${money(summary.debts.payable)}`;
  return `<b>Today</b>\n\nTasks: ${summary.tasks.dueToday} due · ${summary.tasks.overdue} overdue\nExpenses: ${money(summary.money.expenses)}\nIncome: ${money(summary.money.income)}`;
}

async function executeIntent(userId, parsed, settings) {
  const t = settings.telegram;
  if (['SHOW_TODAY', 'SHOW_MONEY', 'SHOW_DEBTS'].includes(parsed.intent)) return { text: await summaries(userId, parsed.intent) };
  if (parsed.intent === 'CREATE_EXPENSE' || parsed.intent === 'CREATE_INCOME') {
    const isExpense = parsed.intent === 'CREATE_EXPENSE';
    const accountId = isExpense ? t.defaultExpenseAccount : t.defaultIncomeAccount;
    if (!accountId) return { text: 'Set a default account in Settings before recording money.' };
    const item = await createTransaction(userId, { ...parsed.data, type: isExpense ? 'expense' : 'income', accountId, createdVia: 'telegram' });
    return { text: `✓ ${isExpense ? 'Expense' : 'Income'} added\n\n<b>${money(item.amount, settings.defaultCurrency)}</b>\n${escapeHtml(item.description)}\n${escapeHtml(item.category)}`, markup: keyboard(['Undo', `undo:transaction:${item._id}`]) };
  }
  if (parsed.intent === 'CREATE_TASK') {
    const item = await createTask(userId, { ...parsed.data, createdVia: 'telegram' });
    return { text: `✓ Task created\n\n<b>${escapeHtml(item.title)}</b>${item.dueDate ? `\n${dayjs(item.dueDate).format('ddd, D MMM')}` : ''}`, markup: keyboard(['Done', `done:task:${item._id}`], ['Delete', `undo:task:${item._id}`]) };
  }
  if (parsed.intent === 'CREATE_RECEIVABLE' || parsed.intent === 'CREATE_PAYABLE') {
    const type = parsed.intent === 'CREATE_RECEIVABLE' ? 'receivable' : 'payable';
    const item = await createDebt(userId, { ...parsed.data, type, currency: settings.defaultCurrency, createdVia: 'telegram' });
    return { text: `✓ ${type === 'receivable' ? 'Receivable' : 'Payable'} created\n\n<b>${escapeHtml(item.personName)}</b>\n${money(item.originalAmount, item.currency)}` };
  }
  if (parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' || parsed.intent === 'RECORD_PAYABLE_PAYMENT') {
    const type = parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' ? 'receivable' : 'payable';
    const accountId = type === 'receivable' ? t.defaultIncomeAccount : t.defaultExpenseAccount;
    if (!accountId) return { text: 'Set a default account in Settings before recording a payment.' };
    const debt = await Debt.findOne({ user: userId, type, personName: new RegExp(`^${parsed.data.personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), status: { $ne: 'paid' }, archived: false });
    if (!debt) return { text: `I couldn't find an open debt for ${escapeHtml(parsed.data.personName)}.` };
    const updated = await recordDebtPayment(userId, debt._id, { amount: parsed.data.amount, accountId, createdVia: 'telegram' });
    return { text: `✓ Payment recorded\n\n<b>${escapeHtml(debt.personName)}</b>\nRemaining: ${money(updated.remainingAmount, debt.currency)}` };
  }
  return { text: 'I did not understand that yet. Try “spent 500 coffee”, “income 15000 freelance”, or “task call dentist tomorrow”.' };
}

async function handleCallback(callback, userId, token) {
  const [action, type, id] = String(callback.data || '').split(':');
  if (action === 'undo' && type === 'transaction') await archiveTransaction(userId, id, 'telegram');
  if (action === 'undo' && type === 'task') await Task.findOneAndUpdate({ _id: id, user: userId }, { archived: true });
  if (action === 'done' && type === 'task') await updateTask(userId, id, { status: 'completed' });
  await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: action === 'done' ? 'Task completed' : 'Action undone' });
  await telegramRequest(token, 'editMessageReplyMarkup', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } });
}

export async function handleTelegramUpdate(update) {
  const token = env.ORBIT_TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const message = update.message;
  const callback = update.callback_query;
  const from = message?.from || callback?.from;
  const chatId = message?.chat?.id || callback?.message?.chat?.id;
  if (!from?.id || !chatId) return;
  const text = message?.text || '';
  if (text.startsWith('/start ')) {
    try {
      await consumeTelegramLink(text.slice(7).trim(), { id: from.id, username: from.username, chatId });
      return sendMessage(token, chatId, '✓ Your Telegram account is now connected to Orbit.');
    } catch (error) { return sendMessage(token, chatId, escapeHtml(error.message)); }
  }
  const connection = await TelegramConnection.findOne({ telegramUserId: String(from.id) });
  if (!connection) return sendMessage(token, chatId, 'Connect Telegram from your Orbit Settings first.');
  const user = await User.findById(connection.user);
  if (!user) return;
  const access = await checkAccess(user);
  if (!access.eligible) return sendMessage(token, chatId, access.reason === 'SUSPENDED' ? 'Your Orbit account is suspended.' : 'Your Orbit access has expired. Activate a new access plan using an Activation Link.');
  const userId = user._id;
  const settings = await getSettingsDocument(userId);
  connection.chatId = String(chatId);
  connection.lastInteractionAt = new Date();
  await connection.save();
  if (callback) return handleCallback(callback, userId, token);
  if (['/start', '/menu', '/help'].includes(text.split(' ')[0])) return sendMessage(token, chatId, '<b>Orbit</b>\n\nTry /today, /money, /debts, or send:\n• spent 500 coffee\n• income 15000 freelance\n• task call dentist tomorrow');
  if (text === '/tasks') return sendMessage(token, chatId, `<b>Tasks</b>\n\n${await Task.countDocuments({ user: userId, archived: false, status: { $in: ['todo', 'in_progress'] } })} open`);
  if (text === '/accounts') { const accounts = await accountBalances(userId, { archived: false }); return sendMessage(token, chatId, `<b>Accounts</b>\n\n${accounts.map((a) => `${escapeHtml(a.name)}: ${money(a.currentBalance, a.currency)}`).join('\n') || 'No accounts.'}`); }
  if (text === '/goals') { const rows = await Goal.find({ user: userId, status: 'active' }).sort({ targetDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Goals</b>\n\n${rows.map((r) => `${escapeHtml(r.title)}: ${r.targetAmount ? Math.round((r.currentAmount / r.targetAmount) * 100) : 0}%`).join('\n') || 'No active goals.'}`); }
  if (text === '/bills') { const rows = await Bill.find({ user: userId, status: { $ne: 'paid' } }).sort({ dueDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Upcoming bills</b>\n\n${rows.map((r) => `${escapeHtml(r.name)}: ${money(r.amount, settings.defaultCurrency)} · ${dayjs(r.dueDate).format('D MMM')}`).join('\n') || 'No open bills.'}`); }
  if (text === '/subscriptions') { const rows = await Subscription.find({ user: userId, status: 'active' }).sort({ nextBillingDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Subscriptions</b>\n\n${rows.map((r) => `${escapeHtml(r.name)}: ${money(r.amount, r.currency)} · ${dayjs(r.nextBillingDate).format('D MMM')}`).join('\n') || 'No active subscriptions.'}`); }
  if (text === '/month') return sendMessage(token, chatId, await summaries(userId, 'SHOW_MONEY'));
  if (['/expenses', '/income'].includes(text)) { const type = text.slice(1); const rows = await Transaction.find({ user: userId, type: type === 'expenses' ? 'expense' : 'income', deletedAt: null }).sort({ date: -1 }).limit(5); return sendMessage(token, chatId, `<b>Recent ${type}</b>\n\n${rows.map((r) => `${escapeHtml(r.description)}: ${money(r.amount, settings.defaultCurrency)}`).join('\n') || 'No entries yet.'}`); }
  const result = await executeIntent(userId, parseTelegramMessage(text), settings);
  return sendMessage(token, chatId, result.text, result.markup);
}
