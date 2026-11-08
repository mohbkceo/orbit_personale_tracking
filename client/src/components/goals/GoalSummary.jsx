import { useTranslation } from 'react-i18next';
import { AnimatedProgress } from '../../animations/AnimatedProgress.jsx';
import { formatDate, formatMoney, formatNumber } from '../../utils/format.js';
import { calculateGoalProgress } from '../../../../shared/goalProgress.js';

export function GoalSummary({ goal, currency, detail = false }) {
  const { t } = useTranslation();
  const progress = goal.progress || calculateGoalProgress(goal);
  const money = (value) => formatMoney(value, goal.currency || currency);
  return (
    <div className="space-y-3 text-sm">
      {progress.progressType === 'money' && (
        <>
          <p className="font-semibold" dir="auto">
            {money(goal.currentAmount || 0)}{' '}
            <span className="font-normal text-muted">
              {t('goals:ui.of')}{' '}
              {goal.targetAmount > 0 ? money(goal.targetAmount) : t('goals:unified.noTarget')}
            </span>
          </p>
          {goal.targetAmount > 0 && (
            <p className="text-muted">
              {t('goals:unified.remainingAmount', { amount: money(progress.remaining) })}
            </p>
          )}
        </>
      )}
      {progress.progressType === 'steps' && (
        <>
          <p className="font-semibold">
            {t('goals:unified.stepCount', {
              completed: formatNumber(progress.completedSteps),
              total: formatNumber(progress.totalSteps),
            })}
          </p>
          <p className="text-muted">
            {progress.totalSteps
              ? t('goals:unified.remainingSteps', {
                  remaining: formatNumber(progress.remainingSteps),
                })
              : t('goals:unified.noSteps')}
          </p>
        </>
      )}
      {progress.percentage !== null && (
        <div>
          <AnimatedProgress
            value={progress.percentage}
            label={t('goals:unified.progress')}
            className="h-2"
          />
          <span className="mt-1 block text-xs text-muted">
            {formatNumber(Math.round(progress.percentage))}%
          </span>
        </div>
      )}
      {progress.progressType === 'money' &&
        goal.status === 'active' &&
        goal.targetAmount > 0 &&
        progress.remaining > 0 && (
          <>
            <p
              className={
                progress.paceStatus === 'behind'
                  ? 'text-danger'
                  : progress.paceStatus === 'at_risk'
                    ? 'text-warning'
                    : 'text-muted'
              }
            >
              {progress.paceStatus
                ? t(`goals:unified.pace.${progress.paceStatus}`)
                : progress.estimatedAchievementDate
                  ? t('goals:unified.estimatedDate', {
                      date: formatDate(progress.estimatedAchievementDate),
                    })
                  : t('goals:unified.notEnoughData')}
            </p>
            {detail && (
              <>
                {progress.requiredMonthlySavings !== null && (
                  <p>
                    {t('goals:unified.monthlySavings', {
                      amount: money(progress.requiredMonthlySavings),
                    })}
                  </p>
                )}
                {progress.paceStatus && progress.estimatedAchievementDate && (
                  <p className="text-muted">
                    {t('goals:unified.estimatedDate', {
                      date: formatDate(progress.estimatedAchievementDate),
                    })}
                  </p>
                )}
                <p className="text-xs text-muted">{t('goals:unified.paceExplanation')}</p>
              </>
            )}
          </>
        )}
      {goal.targetDate && (
        <p className="text-xs text-muted">
          {t('goals:unified.dueDate', { date: formatDate(goal.targetDate) })}
        </p>
      )}
    </div>
  );
}
