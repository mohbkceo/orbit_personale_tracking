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

const prompts = {
  task: ['CREATE_TASK', 'Send the task.\n\nExample: Call supplier tomorrow 14:00 high'],
  sale: ['CREATE_SALE', 'Send the sale amount and description.\n\nExample: 12500 Stand x3 #Logix @Ahmed'],
  din: ['CREATE_RECEIVABLE', 'Send: person amount description\n\nExample: Ahmed 5000 NFC order'],
  dout: ['CREATE_PAYABLE', 'Send: person amount description\n\nExample: Karim 3000 printing'],
  expense: ['CREATE_EXPENSE', 'Send: amount description\n\nExample: 650 lunch'],
  income: ['CREATE_INCOME', 'Send: amount description\n\nExample: 15000 freelance'],
};

export async function handleCallbackAction(callback, userId, settings) {
  const [namespace, action, id, extra] = String(callback.data || '').split(':');
  const session = { userId: callback.from.id, chatId: callback.message.chat.id };
  if (namespace === 'quick' && prompts[action] && !id) {
    await setPending(session.userId, session.chatId, prompts[action][0]);
    return { answer: 'Ready', text: prompts[action][1] };
  }
  if (namespace === 'nav' && ['tasks', 'debts', 'sales'].includes(action) && !id) return { answer: 'Opened', ...(await executeIntent(userId, { intent: `SHOW_${action.toUpperCase()}`, data: {} }, settings)) };
  if (namespace === 'last' && action === 'undo' && ['task', 'tx', 'debt'].includes(id) && mongoose.isValidObjectId(extra)) {
    const kind = id;
    const row = kind === 'task' ? await Task.findOne({ _id: extra, user: userId, createdVia: 'telegram', archived: false }) : kind === 'tx' ? await Transaction.findOne({ _id: extra, user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } }) : await Debt.findOne({ _id: extra, user: userId, createdVia: 'telegram', archived: false, 'payments.0': { $exists: false } });
    if (!row) return { answer: 'Action unavailable', text: 'This item can no longer be undone.', removeMarkup: true };
    if (kind === 'task') await archiveTask(userId, extra);
    if (kind === 'tx') await archiveTransaction(userId, extra, 'telegram');
    if (kind === 'debt') await archiveUnpaidDebt(userId, extra);
    return { answer: 'Undone', text: '✓ Action undone', removeMarkup: true };
  }
  if (!mongoose.isValidObjectId(id)) return { answer: 'Invalid action', text: 'That action is no longer available.' };
  if (namespace === 'task' && ['done', 'edit', 'delete'].includes(action)) {
    const task = await Task.findOne({ _id: id, user: userId, archived: false });
    if (!task) return { answer: 'Task unavailable', text: 'This task is no longer available.', removeMarkup: true };
    if (action === 'edit') { await setPending(session.userId, session.chatId, 'EDIT_TASK', { id }); return { answer: 'Ready', text: 'Send the updated task.\n\nExample: Call supplier friday 10:00 urgent' }; }
    if (action === 'done') await updateTask(userId, id, { status: 'completed' });
    else await archiveTask(userId, id);
    return { answer: action === 'done' ? 'Task completed' : 'Task deleted', text: `✓ Task ${action === 'done' ? 'completed' : 'deleted'}\n\n<b>${h(task.title)}</b>`, removeMarkup: true };
  }
  if (namespace === 'debt' && ['pay', 'paid', 'delete', 'select'].includes(action)) {
    const debt = await Debt.findOne({ _id: id, user: userId, archived: false });
    if (!debt) return { answer: 'Debt unavailable', text: 'This debt is no longer available.', removeMarkup: true };
    if (action === 'delete') {
      if (debt.payments.length) return { answer: 'Debt has payments', text: 'This debt has payment history and cannot be deleted.' };
      await archiveUnpaidDebt(userId, id);
      return { answer: 'Debt deleted', text: '✓ Debt deleted', removeMarkup: true };
    }
    if (debt.remainingAmount <= 0 || debt.status === 'paid') return { answer: 'Already paid', text: 'This debt is already paid.', removeMarkup: true };
    if (action === 'pay') {
      await setPending(session.userId, session.chatId, 'PAY_DEBT', { id });
      return { answer: 'Ready', text: debt.type === 'receivable' ? `How much did ${h(debt.personName)} pay?` : `How much did you pay ${h(debt.personName)}?` };
    }
    if (action === 'select') {
      const pending = await getPending(session.userId, session.chatId);
      if (!pending || pending.action !== 'SELECT_DEBT' || pending.payload.type !== debt.type || debt.personName.toLowerCase() !== pending.payload.name.toLowerCase()) return { answer: 'Selection expired', text: 'That action expired. Please try again.' };
      await clearPending(session.userId, session.chatId);
      const reply = await paymentReply(userId, debt, pending.payload.amount, settings);
      return { answer: 'Selected', ...reply, removeMarkup: reply.text.startsWith('✓') };
    }
    const reply = await paymentReply(userId, debt, debt.remainingAmount, settings);
    return { answer: reply.text.startsWith('✓') ? 'Paid' : 'Account needed', ...reply, removeMarkup: reply.text.startsWith('✓') };
  }
  if (namespace === 'tx' && ['edit', 'undo'].includes(action)) {
    const tx = await Transaction.findOne({ _id: id, user: userId, createdVia: 'telegram', deletedAt: null, type: { $in: ['income', 'expense'] } });
    if (!tx) return { answer: 'Transaction unavailable', text: 'This transaction is no longer available.', removeMarkup: true };
    if (action === 'edit') {
      await setPending(session.userId, session.chatId, 'EDIT_TX', { id });
      return { answer: 'Ready', text: `Send the updated amount and description.\n\nCurrent: ${money(tx.amount, settings.defaultCurrency)} · ${h(tx.description)}` };
    }
    await archiveTransaction(userId, id, 'telegram');
    return { answer: 'Undone', text: '✓ Transaction undone', removeMarkup: true };
  }
  return { answer: 'Unknown action', text: 'That action is no longer available.' };
}
