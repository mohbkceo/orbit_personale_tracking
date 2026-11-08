import { Goal } from '../models/Planning.js';
import { Transaction } from '../models/Transaction.js';
import { getSettingsDocument } from './settingsService.js';
import {
  cancelEntityReminders,
  regenerateAutomaticReminderPlan,
} from './reminders/reminderService.js';
import { AppError } from '../utils/AppError.js';
import { ensureAccount } from './financeService.js';
import {
  initializeGoalSavings,
  resolveGoalCurrency,
  savingsMovement,
  savingsTypes,
  withGoalMutation,
} from './goalSavingsService.js';
import { migrateWishlist } from './wishlistMigrationService.js';
import { calculateGoalProgress, goalProgressType } from '../../../shared/goalProgress.js';

export async function presentGoals(userId, goals) {
  const settings = await getSettingsDocument(userId);
  const history = await Transaction.find({
    user: userId,
    sourceEntityType: 'Goal',
    sourceEntityId: { $in: goals.map((goal) => goal._id) },
  }).lean();
  return Promise.all(
    goals.map(async (document) => {
      const goal = document.toObject ? document.toObject() : { ...document };
      const linked = history.filter((item) => String(item.sourceEntityId) === String(goal._id));
      const movements = linked.filter(
        (item) => !item.deletedAt && savingsTypes.includes(item.type),
      );
      if (goal.savingsOpeningAmount != null)
        goal.currentAmount = Math.max(
          0,
          Math.round(
            (goal.savingsOpeningAmount +
              movements.reduce((sum, item) => sum + savingsMovement(item), 0)) *
              1e8,
          ) / 1e8,
        );
      const progress = calculateGoalProgress(goal, movements);
      const {
        mutationLease: _lease,
        legacyWishlist: _legacy,
        savingsOpeningAmount: _opening,
        ...visible
      } = goal;
      return {
        ...visible,
        progressType: progress.progressType,
        progress,
        currency: (await resolveGoalCurrency(goal, movements)) || settings.defaultCurrency || 'DZD',
        hasSavingsHistory: linked.length > 0,
        legacyDetails: (goal.legacyWishlist || []).map((entry) => ({
          id: entry.wishlistId,
          ...entry.original,
        })),
      };
    }),
  );
}

export async function listGoals(userId, { migrate = true } = {}) {
  if (migrate) {
    const report = await migrateWishlist({ userId, dryRun: false });
    if (report.errors.length)
      console.warn('Wishlist migration requires review', JSON.stringify(report.errors));
  }
  return presentGoals(
    userId,
    await Goal.find({ user: userId, deletedAt: null }).sort({ createdAt: -1 }).lean(),
  );
}

export async function getGoal(userId, goalId) {
  const goal = await Goal.findOne({ _id: goalId, user: userId, deletedAt: null }).lean();
  if (!goal) throw new AppError('Goal not found', 404);
  return (await presentGoals(userId, [goal]))[0];
}

export async function createGoal(userId, input) {
  const settings = await getSettingsDocument(userId);
  const account = input.accountId ? await ensureAccount(userId, input.accountId) : null;
  if (account && input.currency && input.currency !== account.currency)
    throw new AppError('Goal and account currencies must match', 409);
  const progressType = goalProgressType({
    ...input,
    type: input.type || (input.targetAmount != null ? 'financial' : 'personal'),
  });
  if (input.steps?.length && progressType !== 'steps')
    throw new AppError('Only steps goals can have a checklist');
  if (progressType !== 'money' && input.currentAmount > 0)
    throw new AppError('Only money goals can have savings');
  const status =
    input.status ||
    ((progressType === 'money' &&
      input.targetAmount > 0 &&
      input.currentAmount >= input.targetAmount) ||
    (progressType === 'steps' && input.steps?.length && input.steps.every((step) => step.completed))
      ? 'completed'
      : 'active');
  const goal = await Goal.create({
    ...input,
    status,
    progressType,
    type: progressType === 'money' ? 'financial' : 'personal',
    user: userId,
    currency: input.currency || account?.currency || settings.defaultCurrency || 'DZD',
    savingsOpeningAmount: input.currentAmount || 0,
    reminderMode: input.reminderMode || settings.reminders?.defaultEntityModes?.goal || 'automatic',
  });
  await regenerateAutomaticReminderPlan(userId, 'goal', goal._id);
  return goal;
}

export async function updateGoal(userId, goalId, input) {
  const account = input.accountId ? await ensureAccount(userId, input.accountId) : null;
  await withGoalMutation(userId, goalId, async (goal) => {
    const oldType = goalProgressType(goal);
    const nextType = input.progressType || (input.type ? goalProgressType(input) : oldType);
    const history = await initializeGoalSavings(goal);
    const hasHistory =
      history.length ||
      (await Transaction.exists({
        user: userId,
        sourceEntityType: 'Goal',
        sourceEntityId: goalId,
      }));
    if (input.steps && nextType !== 'steps')
      throw new AppError('Only steps goals can have a checklist', 409);
    if (nextType !== oldType && (hasHistory || goal.currentAmount > 0 || goal.steps.length))
      throw new AppError('Keep the tracking method while savings or steps exist.', 409);
    if (input.currentAmount !== undefined && input.currentAmount !== goal.currentAmount) {
      if (hasHistory)
        throw new AppError('Use contributions or withdrawals to change saved money.', 409);
      if (nextType !== 'money' && input.currentAmount > 0)
        throw new AppError('Only money goals can have savings');
      goal.savingsOpeningAmount = input.currentAmount;
    }
    const currency = await resolveGoalCurrency(goal, history);
    if (!goal.currency && currency) goal.currency = currency;
    if (
      input.currency &&
      currency &&
      input.currency !== currency &&
      (hasHistory || goal.currentAmount > 0)
    )
      throw new AppError('Currency cannot change while savings exist.', 409);
    if (
      account &&
      (input.currency || currency) &&
      account.currency !== (input.currency || currency)
    )
      throw new AppError('Goal and account currencies must match', 409);
    const moneyChanged =
      (input.targetAmount !== undefined && input.targetAmount !== goal.targetAmount) ||
      (input.currentAmount !== undefined && input.currentAmount !== goal.currentAmount);
    Object.assign(goal, input, {
      progressType: nextType,
      type: nextType === 'money' ? 'financial' : 'personal',
    });
    if (
      nextType === 'money' &&
      moneyChanged &&
      !input.status &&
      !['paused', 'cancelled'].includes(goal.status)
    )
      goal.status =
        goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount ? 'completed' : 'active';
    if (
      nextType === 'steps' &&
      input.steps &&
      !input.status &&
      !['paused', 'cancelled'].includes(goal.status)
    ) {
      if (goal.steps.length && goal.steps.every((step) => step.completed))
        goal.status = 'completed';
      else if (goal.status === 'completed') goal.status = 'active';
    }
    await goal.save();
    await regenerateAutomaticReminderPlan(userId, 'goal', goal._id);
  });
  return getGoal(userId, goalId);
}

export async function deleteGoal(userId, goalId) {
  await withGoalMutation(userId, goalId, async (goal) => {
    // Tombstones retain savings links, migration provenance and historical reminders.
    goal.deletedAt = new Date();
    await goal.save();
    await cancelEntityReminders(userId, 'goal', goalId);
  });
}

export async function changeGoalStep(userId, goalId, stepId, input, remove = false) {
  await withGoalMutation(userId, goalId, async (goal) => {
    if (goalProgressType(goal) !== 'steps')
      throw new AppError('This goal does not track steps', 409);
    if (stepId) {
      const step = goal.steps.id(stepId);
      if (!step) throw new AppError('Step not found', 404);
      if (remove) step.deleteOne();
      else Object.assign(step, input);
    } else {
      if (goal.steps.length >= 500) throw new AppError('A goal can have up to 500 steps', 409);
      goal.steps.push(input);
    }
    if (!['paused', 'cancelled'].includes(goal.status))
      goal.status =
        goal.steps.length && goal.steps.every((step) => step.completed) ? 'completed' : 'active';
    await goal.save();
    await regenerateAutomaticReminderPlan(userId, 'goal', goalId);
  });
  return getGoal(userId, goalId);
}
