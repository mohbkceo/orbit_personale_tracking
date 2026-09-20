import mongoose from 'mongoose';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { Bill, Goal, Subscription } from '../models/Planning.js';
import { createTransaction, accountBalances, archiveTransaction } from '../services/financeService.js';
import { archiveUnpaidDebt, createDebt, recordDebtPayment } from '../services/debtService.js';
import { createTask, archiveTask } from '../services/taskService.js';
import { dashboardSummary, telegramFinancialSummary } from '../services/dashboardService.js';
import { cancelReminder, createReminder, listReminders, updateReminder } from '../services/reminders/reminderService.js';
import { escapeRegex } from '../utils/query.js';
import { resolveTelegramAccount } from './accountResolver.js';
import { escapeHtml as h, money, rows, taskDue, localDate, localDay } from './formatters.js';
import { setPending } from './sessionService.js';

const open = { archived: false, status: { $in: ['todo', 'in_progress'] } };
const openDebt = { archived: false, status: { $ne: 'paid' }, remainingAmount: { $gt: 0 } };
const valid = (amount) => Number.isFinite(amount) && amount > 0;
const taskButtons = (id) => rows([['✓ Done', `task:done:${id}`], ['Edit', `task:edit:${id}`]], [['Delete', `task:delete:${id}`]]);
const debtButtons = (id) => rows([['Payment', `debt:pay:${id}`], ['Paid', `debt:paid:${id}`]], [['Delete', `debt:delete:${id}`]]);
const txButtons = (id) => rows([['Edit', `tx:edit:${id}`], ['Undo', `tx:undo:${id}`]]);

export function quickMenu() {
  return { text: '<b>Quick Add</b>', markup: rows([['Task', 'quick:task'], ['Sale', 'quick:sale']], [['Debt In', 'quick:din'], ['Debt Out', 'quick:dout']], [['Expense', 'quick:expense'], ['Income', 'quick:income']]) };
}
export function helpText() {
  return '<b>QUICK ENTRY</b>\n' +
    't Call supplier tomorrow\ndin Ahmed 5000\ndout Karim 3000\ns 12500 Stand x3\ne 650 lunch\ni 15000 freelance\n\n' +
    '<b>PAYMENTS</b>\ndpay Ahmed 2000\ndpaid Karim 1000\n\n' +
    '<b>COMMANDS</b>\n/today /quick /tasks /debts /sales /money /last';
}
function taskReply(item, settings) {
  const due = taskDue(item, settings.timezone);
  return { text: `✓ Task added\n\n<b>${h(item.title)}</b>${due ? `\n${due}` : ''}\n${h(item.priority[0].toUpperCase() + item.priority.slice(1))} priority`, markup: taskButtons(item._id) };
}
function debtReply(item) {
  return { text: `✓ ${item.type === 'receivable' ? 'Incoming' : 'Outgoing'} debt\n\n<b>${h(item.personName)}</b>\n${money(item.originalAmount, item.currency)}${item.description ? `\n${h(item.description)}` : ''}\n\nRemaining: ${money(item.remainingAmount, item.currency)}`, markup: debtButtons(item._id) };
}
function txReply(item, settings) {
  const label = item.category === 'Sale' ? 'Sale' : item.type === 'expense' ? 'Expense' : 'Income';
  const sale = item.saleDetails;
  return { text: `✓ ${label} added\n\n<b>${money(item.amount, settings.defaultCurrency)}</b>\n${h(item.description)}${sale?.quantity > 1 ? ` ×${sale.quantity}` : ''}${sale?.business ? `\n${h(sale.business)}` : ''}${sale?.customerName ? `\n${h(sale.customerName)}` : ''}`, markup: txButtons(item._id) };
}
export async function paymentReply(userId, debt, amount, settings) {
  if (!valid(amount)) return { text: 'Amount must be greater than 0.' };
  const account = await resolveTelegramAccount(userId, settings, debt.type === 'receivable' ? 'in' : 'out', debt.currency);
  if (account.error) return { text: account.error };
  const updated = await recordDebtPayment(userId, debt._id, { amount, accountId: account.accountId, createdVia: 'telegram' });
  return { text: `✓ Payment recorded\n\n<b>${h(debt.personName)}</b>\nPaid: ${money(amount, debt.currency)}\n${updated.remainingAmount ? `Remaining: ${money(updated.remainingAmount, debt.currency)}` : 'Paid'}`, markup: updated.remainingAmount ? debtButtons(debt._id) : undefined };
}
async function findDebt(userId, type, name, amount, session) {
  const matches = await Debt.find({ user: userId, type, ...openDebt, personName: new RegExp(`^${escapeRegex(name)}$`, 'i') }).sort({ createdAt: -1 }).limit(12);
  if (!matches.length) return { reply: { text: `I couldn't find an open debt for ${h(name)}.` } };
  if (matches.length === 1) return { debt: matches[0] };
  if (session) await setPending(session.userId, session.chatId, 'SELECT_DEBT', { type, name, amount });
  return { reply: { text: `I found multiple open debts for ${h(name)}. Choose one:`, markup: { inline_keyboard: matches.map((debt) => [{ text: `${debt.description || debt.personName} · ${money(debt.remainingAmount, debt.currency)}`.slice(0, 60), callback_data: `debt:select:${debt._id}` }]) } } };
}
export async function executeIntent(userId, parsed, settings, session) {
  const data = parsed.data || {};
  if (parsed.intent === 'SHOW_TODAY') {
    const [summary, finance] = await Promise.all([dashboardSummary(userId, { timezone: settings.timezone }), telegramFinancialSummary(userId, settings.timezone)]);
    const today = finance.today;
    return { text: `<b>ORBIT — TODAY</b>\n\n<b>TASKS</b>\n${summary.tasks.open} open · ${summary.tasks.overdue} overdue\n\n<b>MONEY</b>\nSales: ${money(today.sales, settings.defaultCurrency)}\nOther income: ${money(today.otherIncome, settings.defaultCurrency)}\nExpenses: ${money(today.expenses, settings.defaultCurrency)}\nNet: ${today.net >= 0 ? '+' : ''}${money(today.net, settings.defaultCurrency)}\n\n<b>DEBTS</b>\nTo receive: ${money(summary.debts.receivable, settings.defaultCurrency)}\nTo pay: ${money(summary.debts.payable, settings.defaultCurrency)}`, markup: rows([['Tasks', 'nav:tasks'], ['Add Task', 'quick:task']], [['Debts', 'nav:debts'], ['Add Debt', 'quick:din']], [['Sales', 'nav:sales'], ['Add Sale', 'quick:sale']]) };
  }
  if (parsed.intent === 'SHOW_MONEY') {
    const summary = await dashboardSummary(userId);
    return { text: `<b>Money</b>\n\nTotal balance: ${money(summary.money.totalBalance, settings.defaultCurrency)}\nThis month: +${money(summary.money.income, settings.defaultCurrency)} / −${money(summary.money.expenses, settings.defaultCurrency)}\nNet: ${money(summary.money.net, settings.defaultCurrency)}` };
  }
  if (parsed.intent === 'SHOW_TASKS') {
    const today = new Date(`${localDay(new Date(), settings.timezone)}T00:00:00.000Z`);
    const [dated, undated, count, overdue] = await Promise.all([
      Task.find({ user: userId, ...open, dueDate: { $ne: null } }).sort({ dueDate: 1, createdAt: -1 }).limit(10),
      Task.find({ user: userId, ...open, dueDate: null }).sort({ createdAt: -1 }).limit(10),
      Task.countDocuments({ user: userId, ...open }),
      Task.countDocuments({ user: userId, ...open, dueDate: { $lt: today, $ne: null } }),
    ]);
    const ordered = [...dated, ...undated].slice(0, 10);
    return { text: `<b>TASKS</b>\n\n${ordered.map((task, index) => `${index + 1}. ${h(task.title.slice(0, 70))}${task.dueDate ? ` — ${taskDue(task, settings.timezone)}` : ''}`).join('\n') || 'No open tasks.'}\n\n${count} open · ${overdue} overdue`, markup: { inline_keyboard: ordered.slice(0, 6).map((task) => [{ text: `✓ ${task.title}`.slice(0, 48), callback_data: `task:done:${task._id}` }]) } };
  }
  if (parsed.intent === 'SHOW_DEBTS') {
    const [debts, totals] = await Promise.all([Debt.find({ user: userId, ...openDebt }).sort({ createdAt: -1 }).limit(20), Debt.aggregate([{ $match: { user: new mongoose.Types.ObjectId(userId), ...openDebt } }, { $group: { _id: '$type', total: { $sum: '$remainingAmount' } } }])]);
    const section = (type) => debts.filter((debt) => debt.type === type).slice(0, 6).map((debt) => `${h(debt.personName.slice(0, 50))} — ${money(debt.remainingAmount, debt.currency)}`).join('\n') || 'None';
    const total = (type) => totals.find((row) => row._id === type)?.total || 0;
    return { text: `<b>DEBTS</b>\n\n<b>TO RECEIVE</b>\n${section('receivable')}\nTotal: ${money(total('receivable'), settings.defaultCurrency)}\n\n<b>TO PAY</b>\n${section('payable')}\nTotal: ${money(total('payable'), settings.defaultCurrency)}` };
  }
  if (parsed.intent === 'SHOW_SALES') {
    const [finance, recent] = await Promise.all([telegramFinancialSummary(userId, settings.timezone), Transaction.find({ user: userId, type: 'income', category: 'Sale', deletedAt: null }).sort({ date: -1, createdAt: -1 }).limit(5)]);
    return { text: `<b>SALES</b>\n\nToday: ${money(finance.today.sales, settings.defaultCurrency)}\nThis month: ${money(finance.month.sales, settings.defaultCurrency)}\n\nRecent:\n${recent.map((item, index) => `${index + 1}. ${h(item.description.slice(0, 80))}${item.saleDetails?.quantity > 1 ? ` ×${item.saleDetails.quantity}` : ''} — ${money(item.amount, settings.defaultCurrency)}`).join('\n') || 'No sales yet.'}` };
  }
  if (parsed.intent === 'SHOW_REMINDERS') {
    const result = await listReminders(userId, { limit: 10 });
    return { text: `<b>Reminders</b>\n\n${result.data.filter((row) => ['scheduled', 'active', 'snoozed', 'waiting'].includes(row.status)).map((row) => `${h(row.title)} · ${h(row.status)} · ${localDate(row.nextTriggerAt, settings.timezone, 'D MMM HH:mm')}\n<code>${row._id}</code>`).join('\n\n') || 'Nothing scheduled.'}` };
  }
  if (parsed.intent === 'CREATE_REMINDER') {
    const reminder = await createReminder(userId, { ...data, deliveryChannels: ['telegram'] }, 'telegram');
    return { text: `✓ Reminder scheduled\n\n<b>${h(reminder.title)}</b>\n${localDate(reminder.nextTriggerAt, settings.timezone, 'ddd, D MMM HH:mm')}`, markup: rows([['Cancel', `r:cancel:${reminder._id}`]]) };
  }
  if (parsed.intent === 'UPDATE_REMINDER') { const { id, ...rest } = data; const reminder = await updateReminder(userId, id, rest); return { text: `✓ Reminder updated\n\n<b>${h(reminder.title)}</b>` }; }
  if (parsed.intent === 'CANCEL_REMINDER') { await cancelReminder(userId, data.id, 'telegram'); return { text: '✓ Reminder cancelled' }; }
  if (parsed.intent === 'CREATE_TASK') {
    if (!data.title) return { text: 'Send the task title.', pending: { action: 'CREATE_TASK', payload: {} } };
    const item = await createTask(userId, { ...data, createdVia: 'telegram' });
    return taskReply(item, settings);
  }
  if (['CREATE_RECEIVABLE', 'CREATE_PAYABLE'].includes(parsed.intent)) {
    if (!data.personName || /^\d+(?:\.\d+)?$/.test(data.personName)) return { text: 'Send: person amount description', pending: { action: parsed.intent, payload: {} } };
    if (!valid(data.originalAmount)) return { text: parsed.intent === 'CREATE_RECEIVABLE' ? `How much does ${h(data.personName)} owe you? Reply with an amount greater than 0.` : `How much do you owe ${h(data.personName)}? Reply with an amount greater than 0.`, pending: { action: parsed.intent, payload: data } };
    const item = await createDebt(userId, { ...data, type: parsed.intent === 'CREATE_RECEIVABLE' ? 'receivable' : 'payable', currency: settings.defaultCurrency, createdVia: 'telegram' });
    return debtReply(item);
  }
  if (['CREATE_SALE', 'CREATE_EXPENSE', 'CREATE_INCOME'].includes(parsed.intent)) {
    if (!valid(data.amount)) return { text: 'Amount must be greater than 0. Send the amount and description.', pending: { action: parsed.intent, payload: {} } };
    if (!data.description) return { text: 'Send a description.', pending: { action: parsed.intent, payload: data } };
    const expense = parsed.intent === 'CREATE_EXPENSE';
    const account = await resolveTelegramAccount(userId, settings, expense ? 'out' : 'in');
    if (account.error) return { text: account.error };
    const item = await createTransaction(userId, { ...data, type: expense ? 'expense' : 'income', category: parsed.intent === 'CREATE_SALE' ? 'Sale' : data.category || 'Other', accountId: account.accountId, createdVia: 'telegram' });
    return txReply(item, settings);
  }
  if (['RECORD_RECEIVABLE_PAYMENT', 'RECORD_PAYABLE_PAYMENT'].includes(parsed.intent)) {
    if (!valid(data.amount)) return { text: 'Amount must be greater than 0.' };
    const type = parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' ? 'receivable' : 'payable';
    const found = await findDebt(userId, type, data.personName, data.amount, session);
    return found.reply || paymentReply(userId, found.debt, data.amount, settings);
  }
  return { text: 'I did not understand. Send /help for quick syntax.' };
}

export async function executeCommand(userId, command, settings) {
  if (command === '/accounts') { const accounts = await accountBalances(userId, { archived: false }); return { text: `<b>Accounts</b>\n\n${accounts.map((a) => `${h(a.name)}: ${money(a.currentBalance, a.currency)}`).join('\n') || 'No accounts.'}` }; }
  if (command === '/goals') { const items = await Goal.find({ user: userId, status: 'active' }).sort({ targetDate: 1 }).limit(8); return { text: `<b>Goals</b>\n\n${items.map((r) => `${h(r.title)}: ${r.targetAmount ? Math.round((r.currentAmount / r.targetAmount) * 100) : 0}%`).join('\n') || 'No active goals.'}` }; }
  if (command === '/bills') { const items = await Bill.find({ user: userId, status: { $ne: 'paid' } }).sort({ dueDate: 1 }).limit(8); return { text: `<b>Upcoming bills</b>\n\n${items.map((r) => `${h(r.name)}: ${money(r.amount, settings.defaultCurrency)} · ${localDate(r.dueDate, settings.timezone, 'D MMM')}`).join('\n') || 'No open bills.'}` }; }
  if (command === '/subscriptions') { const items = await Subscription.find({ user: userId, status: 'active' }).sort({ nextBillingDate: 1 }).limit(8); return { text: `<b>Subscriptions</b>\n\n${items.map((r) => `${h(r.name)}: ${money(r.amount, r.currency)} · ${localDate(r.nextBillingDate, settings.timezone, 'D MMM')}`).join('\n') || 'No active subscriptions.'}` }; }
  if (command === '/month') return executeIntent(userId, { intent: 'SHOW_MONEY' }, settings);
  if (['/expenses', '/income'].includes(command)) { const type = command === '/expenses' ? 'expense' : 'income'; const items = await Transaction.find({ user: userId, type, deletedAt: null }).sort({ date: -1 }).limit(5); return { text: `<b>Recent ${type}</b>\n\n${items.map((r) => `${h(r.description)}: ${money(r.amount, settings.defaultCurrency)}`).join('\n') || 'No entries yet.'}` }; }
  return null;
}

export async function lastAction(userId, settings, undo = false) {
  const [task, debt, tx] = await Promise.all([
    Task.findOne({ user: userId, createdVia: 'telegram', archived: false }).sort({ createdAt: -1 }),
    Debt.findOne({ user: userId, createdVia: 'telegram', archived: false, 'payments.0': { $exists: false } }).sort({ createdAt: -1 }),
    Transaction.findOne({ user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } }).sort({ createdAt: -1 }),
  ]);
  const item = [{ kind: 'task', row: task }, { kind: 'debt', row: debt }, { kind: 'tx', row: tx }].filter((entry) => entry.row).sort((a, b) => b.row.createdAt - a.row.createdAt)[0];
  if (!item) return { text: 'No safe Telegram creation to undo.' };
  if (undo) {
    if (item.kind === 'task') await archiveTask(userId, item.row._id);
    if (item.kind === 'tx') await archiveTransaction(userId, item.row._id, 'telegram');
    if (item.kind === 'debt') await archiveUnpaidDebt(userId, item.row._id);
    return { text: '✓ Last creation undone.' };
  }
  const label = item.kind === 'tx' ? item.row.category === 'Sale' ? 'Sale' : item.row.type === 'income' ? 'Income' : 'Expense' : item.kind === 'task' ? 'Task' : 'Debt';
  const detail = item.kind === 'tx' ? `${money(item.row.amount, settings.defaultCurrency)}\n${h(item.row.description)}` : item.kind === 'task' ? h(item.row.title) : `${h(item.row.personName)}\n${money(item.row.remainingAmount, item.row.currency)}`;
  return { text: `<b>LAST ACTION</b>\n\n${label}\n${detail}\n${localDate(item.row.createdAt, settings.timezone, 'D MMM HH:mm')}`, markup: rows([['Undo', `last:undo:${item.kind}:${item.row._id}`]]) };
}
