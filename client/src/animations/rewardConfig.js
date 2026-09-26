export const rewardConfig = Object.freeze({
  TASK_CREATED: { level: 'small', message: 'One step clearer.', effect: 'spark' },
  TASK_COMPLETED: { level: 'medium', message: 'Done. Keep moving.', effect: 'checkBurst' },
  GOAL_CREATED: { level: 'medium', message: 'Goal locked in.', effect: 'orbit' },
  GOAL_25: { level: 'medium', message: 'A quarter of the way there.', effect: 'orbit' },
  GOAL_50: { level: 'medium', message: 'Halfway there.', effect: 'orbit' },
  GOAL_75: { level: 'medium', message: 'The finish is in sight.', effect: 'orbit' },
  GOAL_COMPLETED: { level: 'major', message: 'Goal complete.', effect: 'celebration' },
  DAILY_GOALS_COMPLETED: { level: 'major', message: "Today's focus complete", effect: 'celebration' },
  DEBT_CREATED: { level: 'small', message: 'Balance recorded.', effect: 'spark' },
  DEBT_PAID: { level: 'medium', message: 'Debt paid in full.', effect: 'checkBurst' },
  EXPENSE_RECORDED: { level: 'small', message: "Recorded. You're keeping track.", effect: 'none' },
  INCOME_RECORDED: { level: 'small', message: 'Income recorded.', effect: 'spark' },
  SAVINGS_CONTRIBUTED: { level: 'small', message: 'Savings are growing.', effect: 'spark' },
});

export function crossedGoalMilestone(before, after) {
  const milestones = [[100, 'GOAL_COMPLETED'], [75, 'GOAL_75'], [50, 'GOAL_50'], [25, 'GOAL_25']];
  return milestones.find(([threshold]) => before < threshold && after >= threshold)?.[1] || null;
}
