import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Goal, Plus } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { EmptyState, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { GoalForm } from '../components/goals/GoalForm.jsx';
import { GoalSummary } from '../components/goals/GoalSummary.jsx';
import { GoalDetail } from '../components/goals/GoalDetail.jsx';

export default function Goals() {
  const { t } = useTranslation();
  const { settings } = useApp();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const { data, loading, error, reload } = useData(() => endpoints.list('goals'), []);
  const items = data?.data || [];
  const selected = items.find((item) => item._id === params.get('goal'));
  const visible = items.filter((item) => filter === 'all' || item.status === filter);
  const close = () =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('goal');
        next.delete('add');
        return next;
      },
      { replace: true },
    );
  return (
    <>
      <PageHeader
        title={t('navigation:goals')}
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            <Plus size={18} />
            {t('goals:unified.addGoal')}
          </button>
        }
      />
      {data?.migration?.errors?.length > 0 && (
        <p role="alert" className="mb-4 rounded-lg border border-warning p-3 text-sm">
          {t('goals:unified.migrationReview')}
        </p>
      )}
      <div className="mb-5 flex gap-2" role="group" aria-label={t('goals:unified.filterGoals')}>
        {['all', 'active', 'completed'].map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${filter === value ? 'bg-selected text-primary' : 'text-muted hover:bg-hover'}`}
            onClick={() => setFilter(value)}
          >
            {t(`goals:unified.filters.${value}`)}
          </button>
        ))}
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon={Goal} title={t('goals:unified.unavailable')} description={error} />
      ) : visible.length ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((goal) => (
            <button
              key={goal._id}
              className="panel-flat flex min-w-0 flex-col items-stretch space-y-4 p-5 text-start transition-colors hover:border-primary focus-visible:outline-primary"
              onClick={() => setParams({ goal: goal._id })}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-display text-lg font-bold">{goal.title}</h2>
                <StatusBadge tone={goal.status === 'completed' ? 'success' : 'neutral'}>
                  {goal.status}
                </StatusBadge>
              </div>
              <GoalSummary goal={goal} currency={settings.defaultCurrency} />
            </button>
          ))}
        </section>
      ) : (
        <EmptyState icon={Goal} title={t('goals:unified.noGoals')} />
      )}
      {(adding || params.has('add')) && (
        <GoalForm
          onClose={() => {
            setAdding(false);
            close();
          }}
          onSaved={reload}
        />
      )}
      {selected && !adding && !params.has('add') && (
        <GoalDetail
          key={selected._id}
          initialGoal={selected}
          onClose={close}
          onSaved={reload}
          currency={settings.defaultCurrency}
        />
      )}
    </>
  );
}
