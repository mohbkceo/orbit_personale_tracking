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
import { assertFeature } from '../services/entitlementService.js';
import { telegramText as tr } from '../i18n/telegram.js';

const open = { archived: false, status: { $in: ['todo', 'in_progress'] } };
const openDebt = { archived: false, status: { $ne: 'paid' }, remainingAmount: { $gt: 0 } };
const valid = (amount) => Number.isFinite(amount) && amount > 0;
const localizedMoney = (settings, amount, currency) => money(amount, currency, settings.language);
const localizedDate = (settings, date, zone, format) => localDate(date, zone, format, settings.language);
const taskButtons = (id, settings) => rows([[`✓ ${tr(settings, 'done')}`, `task:done:${id}`], [tr(settings, 'edit'), `task:edit:${id}`]], [[tr(settings, 'delete'), `task:delete:${id}`]]);
const debtButtons = (id, settings) => rows([[tr(settings, 'payment'), `debt:pay:${id}`], [tr(settings, 'paid'), `debt:paid:${id}`]], [[tr(settings, 'delete'), `debt:delete:${id}`]]);
const txButtons = (id, settings) => rows([[tr(settings, 'edit'), `tx:edit:${id}`], [tr(settings, 'undo'), `tx:undo:${id}`]]);

export function quickMenu(settings) {
  return { text: tr(settings, 'quickPrompt'), markup: rows([[`✅ ${tr(settings, 'task')}`, 'add:task'], [`🔔 ${tr(settings, 'reminder')}`, 'add:reminder']], [[`🎯 ${tr(settings, 'goal')}`, 'add:goal']], [[tr(settings, 'sale'), 'quick:sale'], [tr(settings, 'expense'), 'quick:expense']], [[tr(settings, 'debtIn'), 'quick:din'], [tr(settings, 'debtOut'), 'quick:dout']], [[tr(settings, 'income'), 'quick:income']]) };
}
export function helpText(settings) {
  return `<b>${tr(settings, 'quickEntry')}</b>\n` +
    't Call supplier tomorrow\ndin Ahmed 5000\ndout Karim 3000\ns 12500 Stand x3\ne 650 lunch\ni 15000 freelance\n\n' +
    `<b>${tr(settings, 'payments')}</b>\ndpay Ahmed 2000\ndpaid Karim 1000\n\n` +
    `<b>${tr(settings, 'commands')}</b>\n/today /quick /tasks /debts /sales /money /last /language` +
    (settings?.language === 'ar' ? '\n\nمهمة اتصل بأحمد غدوة\nصرفت 1200 دج\nدين عند أحمد 3000\nأنا مدين لكريم 2000' : '');
}
function taskReply(item, settings) {
  const due = taskDue(item, settings.timezone, settings.language);
  return { text: `✓ ${tr(settings, 'taskAdded')}\n\n<b>${h(item.title)}</b>${due ? `\n${due}` : ''}\n${tr(settings, 'priority', { priority: item.priority })}`, markup: taskButtons(item._id, settings) };
}
function debtReply(item, settings) {
  return { text: `✓ ${tr(settings, item.type === 'receivable' ? 'incomingDebt' : 'outgoingDebt')}\n\n<b>${h(item.personName)}</b>\n${localizedMoney(settings, item.originalAmount, item.currency)}${item.description ? `\n${h(item.description)}` : ''}\n\n${tr(settings, 'remaining')}: ${localizedMoney(settings, item.remainingAmount, item.currency)}`, markup: debtButtons(item._id, settings) };
}
function txReply(item, settings) {
  const label = item.category === 'Sale' ? 'Sale' : item.type === 'expense' ? 'Expense' : 'Income';
  const sale = item.saleDetails;
  return { text: `✓ ${tr(settings, 'added', { item: tr(settings, label.toLowerCase()) })}\n\n<b>${localizedMoney(settings, item.amount, settings.defaultCurrency)}</b>\n${h(item.description)}${sale?.quantity > 1 ? ` ×${sale.quantity}` : ''}${sale?.business ? `\n${h(sale.business)}` : ''}${sale?.customerName ? `\n${h(sale.customerName)}` : ''}`, markup: txButtons(item._id, settings) };
}
export async function paymentReply(userId, debt, amount, settings) {
  if (!valid(amount)) return { text: tr(settings, 'amountPositive') };
  const account = await resolveTelegramAccount(userId, settings, debt.type === 'receivable' ? 'in' : 'out', debt.currency);
  if (account.error) return { text: account.error };
  const updated = await recordDebtPayment(userId, debt._id, { amount, accountId: account.accountId, createdVia: 'telegram' });
  return { text: `✓ ${tr(settings, 'paymentRecorded')}\n\n<b>${h(debt.personName)}</b>\n${tr(settings, 'paid')}: ${localizedMoney(settings, amount, debt.currency)}\n${updated.remainingAmount ? `${tr(settings, 'remaining')}: ${localizedMoney(settings, updated.remainingAmount, debt.currency)}` : tr(settings, 'paid')}`, markup: updated.remainingAmount ? debtButtons(debt._id, settings) : undefined };
}
async function findDebt(userId, type, name, amount, session, settings) {
  const matches = await Debt.find({ user: userId, type, ...openDebt, personName: new RegExp(`^${escapeRegex(name)}$`, 'i') }).sort({ createdAt: -1 }).limit(12);
  if (!matches.length) return { reply: { text: tr(settings, 'debtMissing', { name }) } };
  if (matches.length === 1) return { debt: matches[0] };
  if (session) await setPending(session.userId, session.chatId, 'SELECT_DEBT', { type, name, amount });
  return { reply: { text: tr(settings, 'debtChoose', { name }), markup: { inline_keyboard: matches.map((debt) => [{ text: `${debt.description || debt.personName} · ${localizedMoney(settings, debt.remainingAmount, debt.currency, settings.language)}`.slice(0, 60), callback_data: `debt:select:${debt._id}` }]) } } };
}
export async function executeIntent(userId, parsed, settings, session) {
  const data = parsed.data || {};
  if (parsed.intent === 'SHOW_TODAY') {
    const [summary, finance] = await Promise.all([dashboardSummary(userId, { timezone: settings.timezone }), telegramFinancialSummary(userId, settings.timezone)]);
    const today = finance.today;
    return { text: `<b>ORBIT — ${tr(settings, 'today')}</b>\n\n<b>${tr(settings, 'tasks')}</b>\n${summary.tasks.open} ${tr(settings, 'open')} · ${summary.tasks.overdue} ${tr(settings, 'overdue')}\n\n<b>${tr(settings, 'money')}</b>\n${tr(settings, 'sales')}: ${localizedMoney(settings, today.sales, settings.defaultCurrency)}\n${tr(settings, 'otherIncome')}: ${localizedMoney(settings, today.otherIncome, settings.defaultCurrency)}\n${tr(settings, 'expenses')}: ${localizedMoney(settings, today.expenses, settings.defaultCurrency)}\n${tr(settings, 'net')}: ${today.net >= 0 ? '+' : ''}${localizedMoney(settings, today.net, settings.defaultCurrency)}\n\n<b>${tr(settings, 'debts')}</b>\n${tr(settings, 'toReceive')}: ${localizedMoney(settings, summary.debts.receivable, settings.defaultCurrency)}\n${tr(settings, 'toPay')}: ${localizedMoney(settings, summary.debts.payable, settings.defaultCurrency)}`, markup: rows([[tr(settings, 'tasks'), 'nav:tasks'], [tr(settings, 'addTask'), 'quick:task']], [[tr(settings, 'debts'), 'nav:debts'], [tr(settings, 'addDebt'), 'quick:din']], [[tr(settings, 'sales'), 'nav:sales'], [tr(settings, 'addSale'), 'quick:sale']]) };
  }
  if (parsed.intent === 'SHOW_MONEY') {
    const summary = await dashboardSummary(userId);
    return { text: `<b>${tr(settings, 'money')}</b>\n\n${tr(settings, 'totalBalance')}: ${localizedMoney(settings, summary.money.totalBalance, settings.defaultCurrency)}\n${tr(settings, 'thisMonth')}: +${localizedMoney(settings, summary.money.income, settings.defaultCurrency)} / −${localizedMoney(settings, summary.money.expenses, settings.defaultCurrency)}\n${tr(settings, 'net')}: ${localizedMoney(settings, summary.money.net, settings.defaultCurrency)}` };
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
    return { text: `<b>${tr(settings, 'tasks')}</b>\n\n${ordered.map((task, index) => `${index + 1}. ${h(task.title.slice(0, 70))}${task.dueDate ? ` — ${taskDue(task, settings.timezone)}` : ''}`).join('\n') || tr(settings, 'noOpenTasks')}\n\n${count} ${tr(settings, 'open')} · ${overdue} ${tr(settings, 'overdue')}`, markup: { inline_keyboard: ordered.slice(0, 6).map((task) => [{ text: `✓ ${task.title}`.slice(0, 48), callback_data: `task:done:${task._id}` }]) } };
  }
  if (parsed.intent === 'SHOW_DEBTS') {
    const [debts, totals] = await Promise.all([Debt.find({ user: userId, ...openDebt }).sort({ createdAt: -1 }).limit(20), Debt.aggregate([{ $match: { user: new mongoose.Types.ObjectId(userId), ...openDebt } }, { $group: { _id: '$type', total: { $sum: '$remainingAmount' } } }])]);
    const section = (type) => debts.filter((debt) => debt.type === type).slice(0, 6).map((debt) => `${h(debt.personName.slice(0, 50))} — ${localizedMoney(settings, debt.remainingAmount, debt.currency, settings.language)}`).join('\n') || tr(settings, 'none');
    const total = (type) => totals.find((row) => row._id === type)?.total || 0;
    return { text: `<b>${tr(settings, 'debts')}</b>\n\n<b>${tr(settings, 'toReceive')}</b>\n${section('receivable')}\n${tr(settings, 'total')}: ${localizedMoney(settings, total('receivable'), settings.defaultCurrency, settings.language)}\n\n<b>${tr(settings, 'toPay')}</b>\n${section('payable')}\n${tr(settings, 'total')}: ${localizedMoney(settings, total('payable'), settings.defaultCurrency, settings.language)}` };
  }
  if (parsed.intent === 'SHOW_SALES') {
    const [finance, recent] = await Promise.all([telegramFinancialSummary(userId, settings.timezone), Transaction.find({ user: userId, type: 'income', category: 'Sale', deletedAt: null }).sort({ date: -1, createdAt: -1 }).limit(5)]);
    return { text: `<b>${tr(settings, 'sales')}</b>\n\n${tr(settings, 'today')}: ${localizedMoney(settings, finance.today.sales, settings.defaultCurrency, settings.language)}\n${tr(settings, 'thisMonth')}: ${localizedMoney(settings, finance.month.sales, settings.defaultCurrency, settings.language)}\n\n${tr(settings, 'recent')}:\n${recent.map((item, index) => `${index + 1}. ${h(item.description.slice(0, 80))}${item.saleDetails?.quantity > 1 ? ` ×${item.saleDetails.quantity}` : ''} — ${localizedMoney(settings, item.amount, settings.defaultCurrency, settings.language)}`).join('\n') || tr(settings, 'noSales')}` };
  }
  if (parsed.intent === 'SHOW_REMINDERS') {
    const result = await listReminders(userId, { limit: 10 });
    return { text: `<b>${tr(settings, 'reminder')}</b>\n\n${result.data.filter((row) => ['scheduled', 'active', 'snoozed', 'waiting'].includes(row.status)).map((row) => `${h(row.title)} · ${h(row.status)} · ${localizedDate(settings, row.nextTriggerAt, settings.timezone, 'D MMM HH:mm')}\n<code>${row._id}</code>`).join('\n\n') || tr(settings, 'noReminders')}` };
  }
  if (parsed.intent === 'CREATE_REMINDER') {
    const reminder = await createReminder(userId, { ...data, deliveryChannels: ['telegram'] }, 'telegram');
    return { text: `✓ ${tr(settings, 'reminderScheduled')}\n\n<b>${h(reminder.title)}</b>\n${localizedDate(settings, reminder.nextTriggerAt, settings.timezone, 'ddd, D MMM HH:mm')}`, markup: rows([[tr(settings, 'cancel'), `r:cancel:${reminder._id}`]]) };
  }
  if (parsed.intent === 'UPDATE_REMINDER') { const { id, ...rest } = data; const reminder = await updateReminder(userId, id, rest); return { text: `✓ ${tr(settings, 'reminderUpdated')}\n\n<b>${h(reminder.title)}</b>` }; }
  if (parsed.intent === 'CANCEL_REMINDER') { await cancelReminder(userId, data.id, 'telegram'); return { text: `✓ ${tr(settings, 'reminderCancelled')}` }; }
  if (parsed.intent === 'CREATE_TASK') {
    if (!data.title) return { text: tr(settings, 'taskTitlePrompt'), pending: { action: 'CREATE_TASK', payload: {} } };
    const item = await createTask(userId, { ...data, createdVia: 'telegram' });
    return taskReply(item, settings);
  }
  if (['CREATE_RECEIVABLE', 'CREATE_PAYABLE'].includes(parsed.intent)) {
    if (!data.personName || /^\d+(?:\.\d+)?$/.test(data.personName)) return { text: tr(settings, 'debtPrompt'), pending: { action: parsed.intent, payload: {} } };
    if (!valid(data.originalAmount)) return { text: tr(settings, parsed.intent === 'CREATE_RECEIVABLE' ? 'debtReceivableAmount' : 'debtPayableAmount', { name: data.personName }), pending: { action: parsed.intent, payload: data } };
    const item = await createDebt(userId, { ...data, type: parsed.intent === 'CREATE_RECEIVABLE' ? 'receivable' : 'payable', currency: settings.defaultCurrency, createdVia: 'telegram' });
    return debtReply(item, settings);
  }
  if (['CREATE_SALE', 'CREATE_EXPENSE', 'CREATE_INCOME'].includes(parsed.intent)) {
    if (!valid(data.amount)) return { text: tr(settings, 'amountRequired'), pending: { action: parsed.intent, payload: {} } };
    if (!data.description) return { text: tr(settings, 'descriptionRequired'), pending: { action: parsed.intent, payload: data } };
    const expense = parsed.intent === 'CREATE_EXPENSE';
    const account = await resolveTelegramAccount(userId, settings, expense ? 'out' : 'in');
    if (account.error) return { text: account.error };
    const item = await createTransaction(userId, { ...data, type: expense ? 'expense' : 'income', category: parsed.intent === 'CREATE_SALE' ? 'Sale' : data.category || 'Other', accountId: account.accountId, createdVia: 'telegram' });
    return txReply(item, settings);
  }
  if (['RECORD_RECEIVABLE_PAYMENT', 'RECORD_PAYABLE_PAYMENT'].includes(parsed.intent)) {
    if (!valid(data.amount)) return { text: tr(settings, 'amountPositive') };
    const type = parsed.intent === 'RECORD_RECEIVABLE_PAYMENT' ? 'receivable' : 'payable';
    const found = await findDebt(userId, type, data.personName, data.amount, session, settings);
    return found.reply || paymentReply(userId, found.debt, data.amount, settings);
  }
  if (parsed.intent === 'CLARIFY_REMINDER') return { text: tr(settings, 'reminderClarification') };
  if (parsed.intent === 'CLARIFY_AMOUNT') return { text: tr(settings, 'clarification') };
  return { text: tr(settings, 'unknown') };
}

export async function executeCommand(userId, command, settings) {
  if (command === '/accounts') { const accounts = await accountBalances(userId, { archived: false }); return { text: `<b>${tr(settings, 'accounts')}</b>\n\n${accounts.map((a) => `${h(a.name)}: ${localizedMoney(settings, a.currentBalance, a.currency, settings.language)}`).join('\n') || tr(settings, 'noAccounts')}` }; }
  if (command === '/goals') { const items = await Goal.find({ user: userId, status: 'active' }).sort({ targetDate: 1 }).limit(8); return { text: `<b>${tr(settings, 'goals')}</b>\n\n${items.map((r) => `${h(r.title)}: ${r.targetAmount ? Math.round((r.currentAmount / r.targetAmount) * 100) : 0}%`).join('\n') || tr(settings, 'noGoals')}` }; }
  if (command === '/bills') { const items = await Bill.find({ user: userId, status: { $ne: 'paid' } }).sort({ dueDate: 1 }).limit(8); return { text: `<b>${tr(settings, 'bills')}</b>\n\n${items.map((r) => `${h(r.name)}: ${localizedMoney(settings, r.amount, settings.defaultCurrency, settings.language)} · ${localizedDate(settings, r.dueDate, settings.timezone, 'D MMM', settings.language)}`).join('\n') || tr(settings, 'noBills')}` }; }
  if (command === '/subscriptions') { const items = await Subscription.find({ user: userId, status: 'active' }).sort({ nextBillingDate: 1 }).limit(8); return { text: `<b>${tr(settings, 'subscriptions')}</b>\n\n${items.map((r) => `${h(r.name)}: ${localizedMoney(settings, r.amount, r.currency, settings.language)} · ${localizedDate(settings, r.nextBillingDate, settings.timezone, 'D MMM', settings.language)}`).join('\n') || tr(settings, 'noSubscriptions')}` }; }
  if (command === '/month') return executeIntent(userId, { intent: 'SHOW_MONEY' }, settings);
  if (['/expenses', '/income'].includes(command)) { const type = command === '/expenses' ? 'expense' : 'income'; const items = await Transaction.find({ user: userId, type, deletedAt: null }).sort({ date: -1 }).limit(5); return { text: `<b>${tr(settings, 'recentType', { type: tr(settings, type) })}</b>\n\n${items.map((r) => `${h(r.description)}: ${localizedMoney(settings, r.amount, settings.defaultCurrency, settings.language)}`).join('\n') || tr(settings, 'noEntries')}` }; }
  return null;
}

export async function lastAction(userId, settings, undo = false) {
  const [task, debt, tx] = await Promise.all([
    Task.findOne({ user: userId, createdVia: 'telegram', archived: false }).sort({ createdAt: -1 }),
    Debt.findOne({ user: userId, createdVia: 'telegram', archived: false, 'payments.0': { $exists: false } }).sort({ createdAt: -1 }),
    Transaction.findOne({ user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } }).sort({ createdAt: -1 }),
  ]);
  const item = [{ kind: 'task', row: task }, { kind: 'debt', row: debt }, { kind: 'tx', row: tx }].filter((entry) => entry.row).sort((a, b) => b.row.createdAt - a.row.createdAt)[0];
  if (!item) return { text: tr(settings, 'lastUndoUnavailable') };
  await assertFeature(userId, item.kind === 'tx' ? item.row.type === 'income' ? 'income' : 'expenses' : item.kind === 'debt' ? 'debts' : 'tasks');
  if (undo) {
    if (item.kind === 'task') await archiveTask(userId, item.row._id);
    if (item.kind === 'tx') await archiveTransaction(userId, item.row._id, 'telegram');
    if (item.kind === 'debt') await archiveUnpaidDebt(userId, item.row._id);
    return { text: tr(settings, 'lastUndone') };
  }
  const label = item.kind === 'tx' ? item.row.category === 'Sale' ? 'Sale' : item.row.type === 'income' ? 'Income' : 'Expense' : item.kind === 'task' ? 'Task' : 'Debt';
  const detail = item.kind === 'tx' ? `${localizedMoney(settings, item.row.amount, settings.defaultCurrency)}\n${h(item.row.description)}` : item.kind === 'task' ? h(item.row.title) : `${h(item.row.personName)}\n${localizedMoney(settings, item.row.remainingAmount, item.row.currency)}`;
  return { text: `<b>${tr(settings, 'lastAction')}</b>\n\n${tr(settings, label.toLowerCase())}\n${detail}\n${localizedDate(settings, item.row.createdAt, settings.timezone, 'D MMM HH:mm', settings.language)}`, markup: rows([[tr(settings, 'undo'), `last:undo:${item.kind}:${item.row._id}`]]) };
}
