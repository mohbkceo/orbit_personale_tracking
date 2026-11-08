import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Goal } from '../models/Planning.js';
import { Transaction } from '../models/Transaction.js';
import { Account } from '../models/Account.js';
import { AppError } from '../utils/AppError.js';
import { goalProgressType } from '../../../shared/goalProgress.js';
import {
  regenerateAutomaticReminderPlan,
  resolveEntityReminders,
} from './reminders/reminderService.js';

export const savingsTypes = ['savings_contribution', 'savings_withdrawal'];
export const savingsMovement = (item) =>
  !item.deletedAt && savingsTypes.includes(item.type)
    ? Number(item.amount) * (item.type === 'savings_contribution' ? 1 : -1)
    : 0;
export const goalTransaction = (item) => item?.sourceEntityType === 'Goal' && item.sourceEntityId;
export const goalHistory = (userId, goalId) =>
  Transaction.find({
    user: userId,
    sourceEntityType: 'Goal',
    sourceEntityId: goalId,
    deletedAt: null,
    type: { $in: savingsTypes },
  }).lean();

export async function resolveGoalCurrency(goal, history) {
  if (goal.currency) return goal.currency;
  const movements = history || (await goalHistory(goal.user, goal._id));
  const accountId = goal.accountId || movements[0]?.accountId;
  if (!accountId) return null;
  return (
    (await Account.findOne({ _id: accountId, user: goal.user }).select('currency').lean())
      ?.currency || null
  );
}

// A database lease serializes goal/ledger edits across server processes. The ledger remains
// authoritative after an interruption: subsequent reads derive currentAmount from linked ledger entries.
export async function withGoalMutation(userId, goalId, action, { allowDeleted = false } = {}) {
  const token = randomUUID();
  const until = Date.now() + 10000;
  let goal;
  while (!goal && Date.now() < until) {
    goal = await Goal.findOneAndUpdate(
      {
        _id: goalId,
        user: userId,
        ...(allowDeleted ? {} : { deletedAt: null }),
        $or: [{ 'mutationLease.expiresAt': { $lt: new Date() } }, { mutationLease: null }],
      },
      { $set: { mutationLease: { token, expiresAt: new Date(Date.now() + 120000) } } },
      { new: true },
    );
    if (!goal) {
      if (
        !(await Goal.exists({
          _id: goalId,
          user: userId,
          ...(allowDeleted ? {} : { deletedAt: null }),
        }))
      )
        throw new AppError('Goal not found', 404);
      await setTimeout(30);
    }
  }
  if (!goal) throw new AppError('Goal is being updated. Please retry.', 409);
  try {
    return await action(goal);
  } finally {
    await Goal.updateOne(
      { _id: goalId, user: userId, 'mutationLease.token': token },
      { $unset: { mutationLease: 1 } },
    );
  }
}

export async function initializeGoalSavings(goal) {
  const history = await goalHistory(goal.user, goal._id);
  const net = history.reduce((sum, item) => sum + savingsMovement(item), 0);
  if (goal.savingsOpeningAmount == null) {
    // Legacy currentAmount already includes historic contributions: never count them twice.
    const opening = (goal.currentAmount || 0) - net;
    await Goal.updateOne(
      { _id: goal._id, user: goal.user, savingsOpeningAmount: null },
      { $set: { savingsOpeningAmount: opening } },
    );
    goal.savingsOpeningAmount = opening;
  }
  goal.currentAmount = Math.max(0, Math.round((goal.savingsOpeningAmount + net) * 1e8) / 1e8);
  return history;
}

export async function syncGoalSavings(goal, { updateStatus = true } = {}) {
  const history = await initializeGoalSavings(goal);
  if (
    updateStatus &&
    goal.targetAmount > 0 &&
    goalProgressType(goal) === 'money' &&
    !['paused', 'cancelled'].includes(goal.status)
  ) {
    if (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount) goal.status = 'completed';
    else if (goal.status === 'completed') goal.status = 'active';
  }
  await Goal.updateOne(
    { _id: goal._id, user: goal.user },
    { $set: { currentAmount: goal.currentAmount, status: goal.status } },
  );
  if (!goal.deletedAt) {
    if (goal.status === 'completed') await resolveEntityReminders(goal.user, 'goal', goal._id);
    else await regenerateAutomaticReminderPlan(goal.user, 'goal', goal._id);
  }
  return history;
}

export async function mutateGoalTransaction(userId, before, after, action) {
  const goalId = goalTransaction(before) || goalTransaction(after);
  if (!goalId) return action();
  if (goalTransaction(before) && String(goalTransaction(after)) !== String(goalId))
    throw new AppError(
      'A goal transaction cannot be reassigned. Reverse it and record a new movement.',
      409,
    );
  return withGoalMutation(
    userId,
    goalId,
    async (goal) => {
      if (goalProgressType(goal) !== 'money' && savingsMovement(after))
        throw new AppError('This goal does not track money', 409);
      if (savingsMovement(after)) {
        const account = await Account.findOne({ _id: after.accountId, user: userId });
        const currency = await resolveGoalCurrency(goal);
        if (!account || (currency && currency !== account.currency))
          throw new AppError('Savings accounts must use the goal currency', 409);
        if (!goal.currency) {
          goal.currency = account.currency;
          await Goal.updateOne(
            { _id: goalId, user: userId },
            { $set: { currency: account.currency } },
          );
        }
      }
      // Re-read after obtaining the lease to reject concurrent edits/deletions of the same entry.
      if (before) {
        const live = await Transaction.findOne({
          _id: before._id,
          user: userId,
          deletedAt: null,
        }).lean();
        if (!live || live.updatedAt?.getTime() !== before.updatedAt?.getTime())
          throw new AppError('Transaction changed. Please reload.', 409);
      }
      await initializeGoalSavings(goal);
      const next =
        goal.currentAmount - (before ? savingsMovement(before) : 0) + savingsMovement(after);
      if (next < -1e-8) throw new AppError('Withdrawal or reversal exceeds the saved amount', 409);
      const result = await action();
      await syncGoalSavings(goal, {
        updateStatus: (before ? savingsMovement(before) : 0) !== savingsMovement(after),
      });
      return result;
    },
    { allowDeleted: Boolean(before) },
  );
}
