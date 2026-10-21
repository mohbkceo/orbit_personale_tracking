import mongoose from 'mongoose';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Transaction } from '../models/Transaction.js';
import { archiveTransaction } from '../services/financeService.js';
import { archiveTask, updateTask } from '../services/taskService.js';
import { archiveUnpaidDebt } from '../services/debtService.js';
import { executeIntent, paymentReply } from './commandHandlers.js';
import { setPending, getPending, clearPending } from './sessionService.js';
import { escapeHtml as h, money } from './formatters.js';
import { assertFeature } from '../services/entitlementService.js';
import { telegramText as tr } from '../i18n/telegram.js';

const prompts = {
  task: ['CREATE_TASK', 'quickTaskPrompt'],
  sale: ['CREATE_SALE', 'quickSalePrompt'],
  din: ['CREATE_RECEIVABLE', 'quickDebtInPrompt'],
  dout: ['CREATE_PAYABLE', 'quickDebtOutPrompt'],
  expense: ['CREATE_EXPENSE', 'quickExpensePrompt'],
  income: ['CREATE_INCOME', 'quickIncomePrompt'],
};

export async function handleCallbackAction(callback, userId, settings) {
  const [namespace, action, id, extra] = String(callback.data || '').split(':');
  const session = { userId: callback.from.id, chatId: callback.message.chat.id };
  if (namespace === 'quick' && prompts[action] && !id) {
    await setPending(session.userId, session.chatId, prompts[action][0]);
    return { answer: tr(settings, 'ready'), text: tr(settings, prompts[action][1]) };
  }
  if (namespace === 'nav' && ['tasks', 'debts', 'sales'].includes(action) && !id) return { answer: tr(settings, 'opened'), ...(await executeIntent(userId, { intent: `SHOW_${action.toUpperCase()}`, data: {} }, settings)) };
  if (namespace === 'last' && action === 'undo' && ['task', 'tx', 'debt'].includes(id) && mongoose.isValidObjectId(extra)) {
    const kind = id;
    const row = kind === 'task' ? await Task.findOne({ _id: extra, user: userId, createdVia: 'telegram', archived: false }) : kind === 'tx' ? await Transaction.findOne({ _id: extra, user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } }) : await Debt.findOne({ _id: extra, user: userId, createdVia: 'telegram', archived: false, 'payments.0': { $exists: false } });
    if (!row) return { answer: tr(settings, 'actionUnavailable'), text: tr(settings, 'itemCannotUndo'), removeMarkup: true };
    await assertFeature(userId, kind === 'tx' ? row.type === 'income' ? 'income' : 'expenses' : kind === 'debt' ? 'debts' : 'tasks');
    if (kind === 'task') await archiveTask(userId, extra);
    if (kind === 'tx') await archiveTransaction(userId, extra, 'telegram');
    if (kind === 'debt') await archiveUnpaidDebt(userId, extra);
    return { answer: tr(settings, 'undone'), text: tr(settings, 'actionUndone'), removeMarkup: true };
  }
  if (!mongoose.isValidObjectId(id)) return { answer: tr(settings, 'invalidAction'), text: tr(settings, 'actionExpired') };
  if (namespace === 'task' && ['done', 'edit', 'delete'].includes(action)) {
    const task = await Task.findOne({ _id: id, user: userId, archived: false });
    if (!task) return { answer: tr(settings, 'taskUnavailable'), text: tr(settings, 'taskUnavailable'), removeMarkup: true };
    if (action === 'edit') { await setPending(session.userId, session.chatId, 'EDIT_TASK', { id }); return { answer: tr(settings, 'ready'), text: tr(settings, 'taskEditPrompt') }; }
    if (action === 'done') await updateTask(userId, id, { status: 'completed' });
    else await archiveTask(userId, id);
    const result = tr(settings, action === 'done' ? 'taskCompleted' : 'taskDeleted');
    return { answer: result, text: `✓ ${result}\n\n<b>${h(task.title)}</b>`, removeMarkup: true };
  }
  if (namespace === 'debt' && ['pay', 'paid', 'delete', 'select'].includes(action)) {
    const debt = await Debt.findOne({ _id: id, user: userId, archived: false });
    if (!debt) return { answer: tr(settings, 'debtUnavailable'), text: tr(settings, 'debtUnavailable'), removeMarkup: true };
    if (action === 'delete') {
      if (debt.payments.length) return { answer: tr(settings, 'debtHasPayments'), text: tr(settings, 'debtHasPaymentsDetail') };
      await archiveUnpaidDebt(userId, id);
      return { answer: tr(settings, 'debtDeleted'), text: `✓ ${tr(settings, 'debtDeleted')}`, removeMarkup: true };
    }
    if (debt.remainingAmount <= 0 || debt.status === 'paid') return { answer: tr(settings, 'alreadyPaid'), text: tr(settings, 'debtAlreadyPaid'), removeMarkup: true };
    if (action === 'pay') {
      await setPending(session.userId, session.chatId, 'PAY_DEBT', { id });
      return { answer: tr(settings, 'ready'), text: tr(settings, debt.type === 'receivable' ? 'howMuchReceived' : 'howMuchPaid', { name: debt.personName }) };
    }
    if (action === 'select') {
      const pending = await getPending(session.userId, session.chatId);
      if (!pending || pending.action !== 'SELECT_DEBT' || pending.payload.type !== debt.type || debt.personName.toLowerCase() !== pending.payload.name.toLowerCase()) return { answer: tr(settings, 'selectionExpired'), text: tr(settings, 'actionExpired') };
      await clearPending(session.userId, session.chatId);
      const reply = await paymentReply(userId, debt, pending.payload.amount, settings);
      return { answer: tr(settings, 'selected'), ...reply, removeMarkup: reply.text.startsWith('✓') };
    }
    const reply = await paymentReply(userId, debt, debt.remainingAmount, settings);
    return { answer: tr(settings, reply.text.startsWith('✓') ? 'paid' : 'accountNeeded'), ...reply, removeMarkup: reply.text.startsWith('✓') };
  }
  if (namespace === 'tx' && ['edit', 'undo'].includes(action)) {
    const tx = await Transaction.findOne({ _id: id, user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } });
    if (!tx) return { answer: tr(settings, 'transactionUnavailable'), text: tr(settings, 'transactionUnavailable'), removeMarkup: true };
    await assertFeature(userId, tx.type === 'income' ? 'income' : 'expenses');
    if (action === 'edit') {
      await setPending(session.userId, session.chatId, 'EDIT_TX', { id });
      return { answer: tr(settings, 'ready'), text: tr(settings, 'txEditPrompt', { amount: money(tx.amount, settings.defaultCurrency, settings.language), description: tx.description }) };
    }
    await archiveTransaction(userId, id, 'telegram');
    return { answer: tr(settings, 'undone'), text: tr(settings, 'transactionUndone'), removeMarkup: true };
  }
  return { answer: tr(settings, 'unknownAction'), text: tr(settings, 'actionExpired') };
}
