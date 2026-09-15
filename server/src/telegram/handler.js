import dayjs from 'dayjs';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { accountBalances, archiveTransaction, createTransaction } from '../services/financeService.js';
import { createDebt, recordDebtPayment } from '../services/debtService.js';
import { createTask, updateTask } from '../services/taskService.js';
import { dashboardSummary } from '../services/dashboardService.js';
import { getSettingsDocument, telegramToken } from '../services/settingsService.js';
import { sendMessage, telegramRequest } from './botClient.js';
import { parseTelegramMessage } from './parser.js';

const money = (amount, currency = 'DZD') => new Intl.NumberFormat('en-DZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
const keyboard = (...buttons) => ({ inline_keyboard: [buttons.map(([text, callback_data]) => ({ text, callback_data }))] });

export const isTelegramUserAllowed = (settings, userId) =>
  settings.telegram.allowedTelegramUserIds.includes(Number(userId));

async function summaries(intent) {
  const summary = await dashboardSummary();
  if (intent === 'SHOW_MONEY') return `<b>Money</b>\n\nTotal balance: ${money(summary.money.totalBalance)}\nThis month: +${money(summary.money.income)} / −${money(summary.money.expenses)}\nNet: ${money(summary.money.net)}`;
  if (intent === 'SHOW_DEBTS') return `<b>Debts</b>\n\nOwed to you: ${money(summary.debts.receivable)}\nYou owe: ${money(summary.debts.payable)}`;
  return `<b>Today</b>\n\nTasks: ${summary.tasks.dueToday} due · ${summary.tasks.overdue} overdue\nExpenses: ${money(summary.money.expenses)}\nIncome: ${money(summary.money.income)}`;
}

async function executeIntent(parsed, settings) {
  const t = settings.telegram;
  if (['SHOW_TODAY', 'SHOW_MONEY', 'SHOW_DEBTS'].includes(parsed.intent)) return { text: await summaries(parsed.intent) };
  if (parsed.intent === 'CREATE_EXPENSE' || parsed.intent === 'CREATE_INCOME') {
    const isExpense = parsed.intent === 'CREATE_EXPENSE';
    const accountId = isExpense ? t.defaultExpenseAccount : t.defaultIncomeAccount;
    if (!accountId) return { text: 'Set a default account in Settings before recording money.' };
    const item = await createTransaction({ ...parsed.data, type: isExpense ? 'expense' : 'income', accountId, createdVia: 'telegram' });
    return { text: `✓ ${isExpense ? 'Expense' : 'Income'} added\n\n<b>${money(item.amount, settings.defaultCurrency)}</b>\n${item.description}\n${item.category}`, markup: keyboard(['Undo', `undo:transaction:${item._id}`]) };
  }
  if (parsed.intent === 'CREATE_TASK') {
    const item = await createTask({ ...parsed.data, createdVia: 'telegram' });
    return { text: `✓ Task created\n\n<b>${item.title}</b>${item.dueDate ? `\n${dayjs(item.dueDate).format('ddd, D MMM')}` : ''}`, markup: keyboard(['Done', `done:task:${item._id}`], ['Delete', `undo:task:${item._id}`]) };
  }
  if (parsed.intent === 'CREATE_RECEIVABLE' || parsed.intent === 'CREATE_PAYABLE') {
    const type = parsed.intent === 'CREATE_RECEIVABLE' ? 'receivable' : 'payable';
    const item = await createDebt({ ...parsed.data, type, currency: settings.defaultCurrency, createdVia: 'telegram' });
    return { text: `✓ ${type === 'receivable' ? 'Receivable' : 'Payable'} created\n\n<b>${item.personName}</b>\n${money(item.originalAmount, item.currency)}` };
  }
  if (parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' || parsed.intent === 'RECORD_PAYABLE_PAYMENT') {
    const type = parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' ? 'receivable' : 'payable';
    const accountId = type === 'receivable' ? t.defaultIncomeAccount : t.defaultExpenseAccount;
    const debt = await Debt.findOne({ type, personName: new RegExp(`^${parsed.data.personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), status: { $ne: 'paid' }, archived: false });
    if (!debt) return { text: `I couldn't find an open debt for ${parsed.data.personName}.` };
    const updated = await recordDebtPayment(debt._id, { amount: parsed.data.amount, accountId, createdVia: 'telegram' });
    return { text: `✓ Payment recorded\n\n<b>${debt.personName}</b>\nRemaining: ${money(updated.remainingAmount, debt.currency)}` };
  }
  return { text: 'I did not understand that yet. Try “spent 500 coffee”, “income 15000 freelance”, or “task call dentist tomorrow”.' };
}

async function handleCallback(callback, settings, token) {
  const [action, type, id] = callback.data.split(':');
  if (action === 'undo' && type === 'transaction') await archiveTransaction(id, 'telegram');
  if (action === 'undo' && type === 'task') await Task.findByIdAndUpdate(id, { archived: true });
  if (action === 'done' && type === 'task') await updateTask(id, { status: 'completed' });
  await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: action === 'done' ? 'Task completed' : 'Action undone' });
  await telegramRequest(token, 'editMessageReplyMarkup', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } });
}

export async function handleTelegramUpdate(update) {
  const settings = await getSettingsDocument();
  if (!settings.telegram.enabled) return;
  const fromId = update.message?.from?.id ?? update.callback_query?.from?.id;
  if (!isTelegramUserAllowed(settings, fromId)) return;
  const token = telegramToken(settings);
  settings.telegram.lastUpdateAt = new Date(); await settings.save();
  if (update.callback_query) return handleCallback(update.callback_query, settings, token);
  const chatId = update.message?.chat?.id;
  const text = update.message?.text || '';
  if (['/start', '/menu', '/help'].includes(text.split(' ')[0])) return sendMessage(token, chatId, '<b>Orbit</b>\n\nTry /today, /money, /debts, or send:\n• spent 500 coffee\n• income 15000 freelance\n• task call dentist tomorrow');
  if (text === '/tasks') { const count = await Task.countDocuments({ archived: false, status: { $in: ['todo', 'in_progress'] } }); return sendMessage(token, chatId, `<b>Tasks</b>\n\n${count} open`); }
  if (text === '/accounts') { const accounts = await accountBalances({ archived: false }); return sendMessage(token, chatId, `<b>Accounts</b>\n\n${accounts.map((a) => `${a.name}: ${money(a.currentBalance, a.currency)}`).join('\n')}`); }
  if (text === '/goals') { const rows = await Goal.find({ status: 'active' }).sort({ targetDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Goals</b>\n\n${rows.map((r) => `${r.title}: ${r.targetAmount ? Math.round((r.currentAmount / r.targetAmount) * 100) : 0}%`).join('\n') || 'No active goals.'}`); }
  if (text === '/bills') { const rows = await Bill.find({ status: { $ne: 'paid' } }).sort({ dueDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Upcoming bills</b>\n\n${rows.map((r) => `${r.name}: ${money(r.amount, settings.defaultCurrency)} · ${dayjs(r.dueDate).format('D MMM')}`).join('\n') || 'No open bills.'}`); }
  if (text === '/subscriptions') { const rows = await Subscription.find({ status: 'active' }).sort({ nextBillingDate: 1 }).limit(8); return sendMessage(token, chatId, `<b>Subscriptions</b>\n\n${rows.map((r) => `${r.name}: ${money(r.amount, r.currency)} · ${dayjs(r.nextBillingDate).format('D MMM')}`).join('\n') || 'No active subscriptions.'}`); }
  if (text === '/month') return sendMessage(token, chatId, await summaries('SHOW_MONEY'));
  if (['/expenses', '/income'].includes(text)) { const type = text.slice(1); const rows = await Transaction.find({ type, deletedAt: null }).sort({ date: -1 }).limit(5); return sendMessage(token, chatId, `<b>Recent ${type}</b>\n\n${rows.map((r) => `${r.description}: ${money(r.amount, settings.defaultCurrency)}`).join('\n') || 'No entries yet.'}`); }
  const result = await executeIntent(parseTelegramMessage(text), settings);
  return sendMessage(token, chatId, result.text, result.markup);
}
