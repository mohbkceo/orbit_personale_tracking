const DAY = 86400000;
const MONTH = (DAY * 365.25) / 12;
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const timestamp = (value) => (value ? new Date(value).getTime() : NaN);

export function goalProgressType(goal) {
  return goal.progressType || (goal.type === 'personal' ? 'simple' : 'money');
}

// Pace describes recorded savings against the deadline; it is not a probability.
// A week of observation and two dated contributions are required for an estimate.
export function calculateGoalProgress(goal, transactions = [], now = new Date()) {
  const progressType = goalProgressType(goal);
  const base = {
    progressType,
    percentage: null,
    remaining: null,
    requiredMonthlySavings: null,
    estimatedAchievementDate: null,
    paceStatus: null,
  };
  if (progressType === 'simple') return base;
  if (progressType === 'steps') {
    const totalSteps = goal.steps?.length || 0;
    const completedSteps = (goal.steps || []).filter((step) => step.completed).length;
    return {
      ...base,
      totalSteps,
      completedSteps,
      remainingSteps: totalSteps - completedSteps,
      percentage: totalSteps ? (completedSteps / totalSteps) * 100 : null,
    };
  }
  const target = Math.max(0, finite(goal.targetAmount));
  const saved = Math.max(0, finite(goal.currentAmount));
  const remaining = Math.max(0, target - saved);
  const result = {
    ...base,
    remaining,
    percentage: target > 0 ? Math.max(0, Math.min(100, (saved / target) * 100)) : null,
  };
  if (goal.status !== 'active' || target <= 0 || remaining === 0) return result;
  const time = timestamp(now);
  const deadline = timestamp(goal.targetDate);
  if (Number.isFinite(deadline)) {
    if (deadline <= time) result.paceStatus = 'behind';
    else result.requiredMonthlySavings = remaining / ((deadline - time) / MONTH);
  }
  const history = transactions.filter(
    (item) =>
      !item.deletedAt &&
      timestamp(item.date) <= time &&
      ['savings_contribution', 'savings_withdrawal'].includes(item.type),
  );
  const contributions = history.filter((item) => item.type === 'savings_contribution');
  const firstDate = history.length
    ? Math.min(...history.map((item) => timestamp(item.date)).filter(Number.isFinite))
    : NaN;
  const start = Math.min(
    firstDate,
    Number.isFinite(timestamp(goal.createdAt)) ? timestamp(goal.createdAt) : firstDate,
  );
  const elapsed = time - start;
  if (
    contributions.length < 2 ||
    new Set(contributions.map((item) => new Date(item.date).toISOString().slice(0, 10))).size < 2 ||
    elapsed < DAY * 7
  )
    return result;
  const net = history.reduce(
    (sum, item) => sum + finite(item.amount) * (item.type === 'savings_contribution' ? 1 : -1),
    0,
  );
  const pace = net / elapsed;
  if (pace > 0) {
    const estimate = time + remaining / pace;
    if (Number.isFinite(estimate) && estimate <= 8640000000000000)
      result.estimatedAchievementDate = new Date(estimate).toISOString();
  }
  if (Number.isFinite(deadline) && deadline > time) {
    const required = remaining / (deadline - time);
    result.paceStatus =
      pace >= required ? 'on_track' : pace >= required * 0.8 ? 'at_risk' : 'behind';
  }
  return result;
}
