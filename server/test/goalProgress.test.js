import { describe, expect, it } from 'vitest';
import { calculateGoalProgress, goalProgressType } from '../../shared/goalProgress.js';

const now = new Date('2026-11-08T00:00:00Z');
const money = {
  progressType: 'money',
  targetAmount: 1000,
  currentAmount: 200,
  status: 'active',
  createdAt: '2026-10-08',
  targetDate: '2026-12-08',
};
const contribution = (date, amount = 100) => ({ type: 'savings_contribution', date, amount });

describe('central goal progress', () => {
  it('maps financial and personal legacy goals', () => {
    expect(goalProgressType({ type: 'financial' })).toBe('money');
    expect(goalProgressType({ type: 'personal' })).toBe('simple');
  });
  it('clamps money progress and remaining safely', () => {
    expect(calculateGoalProgress({ ...money, currentAmount: 1200 }, [], now)).toMatchObject({
      percentage: 100,
      remaining: 0,
    });
    expect(calculateGoalProgress({ ...money, currentAmount: -2 }, [], now)).toMatchObject({
      percentage: 0,
      remaining: 1000,
    });
    for (const targetAmount of [0, undefined, NaN])
      expect(calculateGoalProgress({ ...money, targetAmount }, [], now).percentage).toBeNull();
  });
  it('has no percentage for simple or empty step goals', () => {
    expect(calculateGoalProgress({ progressType: 'simple' }).percentage).toBeNull();
    expect(calculateGoalProgress({ progressType: 'steps' })).toMatchObject({
      percentage: null,
      remainingSteps: 0,
    });
    expect(
      calculateGoalProgress({
        progressType: 'steps',
        steps: [{ completed: true }, { completed: false }],
      }),
    ).toMatchObject({ percentage: 50, completedSteps: 1, totalSteps: 2, remainingSteps: 1 });
  });
  it('computes the required savings and honestly withholds estimates', () => {
    const result = calculateGoalProgress(money, [contribution('2026-10-09')], now);
    expect(result.requiredMonthlySavings).toBeCloseTo(811.6667, 2);
    expect(result.estimatedAchievementDate).toBeNull();
    expect(result.paceStatus).toBeNull();
    expect(
      calculateGoalProgress(money, [contribution('2026-11-08'), contribution('2026-11-08')], now)
        .estimatedAchievementDate,
    ).toBeNull();
  });
  it('estimates using net recorded contributions, including withdrawals', () => {
    const history = [contribution('2026-10-09', 1000), contribution('2026-10-20', 1000)];
    const fast = calculateGoalProgress(money, history, now);
    expect(fast.paceStatus).toBe('on_track');
    expect(new Date(fast.estimatedAchievementDate).getTime()).toBeGreaterThan(now.getTime());
    const slow = calculateGoalProgress(
      money,
      [...history, { type: 'savings_withdrawal', date: '2026-10-25', amount: 1900 }],
      now,
    );
    expect(slow.paceStatus).toBe('behind');
    expect(new Date(slow.estimatedAchievementDate).getTime()).toBeGreaterThan(
      new Date(fast.estimatedAchievementDate).getTime(),
    );
    expect(
      calculateGoalProgress(
        money,
        [contribution('2026-10-09', 400), contribution('2026-10-20', 350)],
        now,
      ).paceStatus,
    ).toBe('at_risk');
  });
  it('handles overdue, paused, completed and undated goals', () => {
    expect(calculateGoalProgress({ ...money, targetDate: '2026-11-01' }, [], now)).toMatchObject({
      paceStatus: 'behind',
      requiredMonthlySavings: null,
    });
    for (const status of ['paused', 'completed', 'cancelled'])
      expect(calculateGoalProgress({ ...money, status }, [], now)).toMatchObject({
        paceStatus: null,
        requiredMonthlySavings: null,
        estimatedAchievementDate: null,
      });
    expect(
      calculateGoalProgress({ ...money, targetDate: null }, [], now).requiredMonthlySavings,
    ).toBeNull();
  });
  it('ignores deleted, future and unrelated transactions for pace', () => {
    const history = [
      contribution('2026-10-09'),
      { ...contribution('2026-10-20', 100000), deletedAt: now },
      contribution('2026-12-01', 100000),
      { type: 'income', date: '2026-10-21', amount: 100000 },
    ];
    expect(calculateGoalProgress(money, history, now).estimatedAchievementDate).toBeNull();
  });
});
