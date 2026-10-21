export const rewardConfig = Object.freeze({
  TASK_CREATED: { level: 'small', message: 'notifications:rewards.taskCreated', effect: 'spark' },
  TASK_COMPLETED: { level: 'medium', message: 'notifications:rewards.taskCompleted', effect: 'checkBurst' },
  GOAL_CREATED: { level: 'medium', message: 'notifications:rewards.goalCreated', effect: 'orbit' },
  GOAL_25: { level: 'medium', message: 'notifications:rewards.goal25', effect: 'orbit' },
  GOAL_50: { level: 'medium', message: 'notifications:rewards.goal50', effect: 'orbit' },
  GOAL_75: { level: 'medium', message: 'notifications:rewards.goal75', effect: 'orbit' },
  GOAL_COMPLETED: { level: 'major', message: 'notifications:rewards.goalCompleted', effect: 'celebration' },
  DAILY_GOALS_COMPLETED: { level: 'major', message: 'notifications:rewards.dailyFocusCompleted', effect: 'celebration' },
  DEBT_CREATED: { level: 'small', message: 'notifications:rewards.debtCreated', effect: 'spark' },
  DEBT_PAID: { level: 'medium', message: 'notifications:rewards.debtPaid', effect: 'checkBurst' },
  EXPENSE_RECORDED: { level: 'small', message: 'notifications:rewards.expenseRecorded', effect: 'none' },
  INCOME_RECORDED: { level: 'small', message: 'notifications:rewards.incomeRecorded', effect: 'spark' },
  SAVINGS_CONTRIBUTED: { level: 'small', message: 'notifications:rewards.savingsContributed', effect: 'spark' },
});

export function crossedGoalMilestone(before, after) {
  const milestones = [[100, 'GOAL_COMPLETED'], [75, 'GOAL_75'], [50, 'GOAL_50'], [25, 'GOAL_25']];
  return milestones.find(([threshold]) => before < threshold && after >= threshold)?.[1] || null;
}
