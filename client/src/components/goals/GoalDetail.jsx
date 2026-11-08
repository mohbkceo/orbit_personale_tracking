import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal, StatusBadge } from '../ui.jsx';
import { GoalSummary } from './GoalSummary.jsx';
import { GoalForm } from './GoalForm.jsx';
import { SavingsForm } from './SavingsForm.jsx';
import { endpoints } from '../../api/client.js';
import { useApp } from '../../context/useApp.js';
import { useCapabilities } from '../../context/CapabilitiesContext.js';
import { formatDate, formatMoney } from '../../utils/format.js';

function Step({ step, disabled, onChange, onRemove }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(step.title);
  return (
    <div className="flex items-center gap-2 border-b border-border py-2">
      <input
        aria-label={t('goals:unified.completeStep', { title: step.title })}
        type="checkbox"
        checked={step.completed}
        disabled={disabled}
        onChange={(event) => onChange({ completed: event.target.checked })}
      />
      <form
        className="flex min-w-0 flex-1 gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim() && title.trim() !== step.title) onChange({ title: title.trim() });
        }}
      >
        <input
          aria-label={t('goals:unified.stepTitle')}
          className={`field min-w-0 ${step.completed ? 'text-muted line-through' : ''}`}
          value={title}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={240}
        />
        {title !== step.title && (
          <button disabled={disabled || !title.trim()} className="btn-secondary">
            {t('goals:ui.save')}
          </button>
        )}
      </form>
      <button
        type="button"
        className="icon-btn shrink-0"
        disabled={disabled}
        onClick={onRemove}
        aria-label={t('goals:unified.removeStep', { title: step.title })}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function GoalDetail({ initialGoal, onClose, onSaved, currency }) {
  const { t } = useTranslation();
  const { toast } = useApp();
  const { allowed } = useCapabilities();
  const [goal, setGoal] = useState(initialGoal);
  const [editing, setEditing] = useState(false);
  const [savings, setSavings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepTitle, setStepTitle] = useState('');
  const saved = (updated) => {
    if (updated) setGoal(updated);
    onSaved();
  };
  async function mutate(action) {
    setBusy(true);
    try {
      const response = await action();
      saved(response.data);
      return true;
    } catch (error) {
      toast(error.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(t('goals:unified.confirmDelete'))) return;
    setBusy(true);
    try {
      await endpoints.remove('goals', goal._id);
      onSaved();
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  if (editing) return <GoalForm goal={goal} onClose={() => setEditing(false)} onSaved={saved} />;
  if (savings) return <SavingsForm goal={goal} onClose={() => setSavings(false)} onSaved={saved} />;
  return (
    <Modal open title={goal.title} onClose={busy ? () => {} : onClose}>
      <div className="space-y-5">
        <StatusBadge>{goal.status}</StatusBadge>
        <GoalSummary goal={goal} currency={currency} detail />
        {goal.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-muted">{goal.description}</p>
        )}
        {goal.notes && goal.notes !== goal.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-muted">{goal.notes}</p>
        )}
        {goal.url && /^https?:\/\//i.test(goal.url) && (
          <a
            className="block truncate text-sm text-primary underline"
            href={goal.url}
            target="_blank"
            rel="noreferrer"
          >
            {goal.url}
          </a>
        )}
        {goal.legacyDetails?.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">
              {t('goals:unified.earlierDetails')}
            </summary>
            <div className="mt-3 space-y-3">
              {goal.legacyDetails.map((item) => (
                <article key={item.id} className="space-y-2 rounded-lg border border-border p-3">
                  <p className="font-semibold">{item.name}</p>
                  {item.expectedPrice != null && (
                    <p>{formatMoney(item.expectedPrice, goal.currency || currency)}</p>
                  )}
                  {item.notes && <p className="whitespace-pre-wrap break-words">{item.notes}</p>}
                  {item.priority && <StatusBadge>{item.priority}</StatusBadge>}
                  {item.category && <p>{item.category}</p>}
                  {item.targetDate && <p>{formatDate(item.targetDate)}</p>}
                  {item.url && /^https?:\/\//i.test(item.url) && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all text-primary underline"
                    >
                      {item.url}
                    </a>
                  )}
                </article>
              ))}
            </div>
          </details>
        )}
        {goal.progressType === 'money' && allowed('accounts') && allowed('transactions') && (
          <button className="btn-secondary w-full" onClick={() => setSavings(true)}>
            {t('goals:ui.manageSavings')}
          </button>
        )}
        {goal.progressType === 'steps' && (
          <section>
            {(goal.steps || []).map((step) => (
              <Step
                key={`${step._id}:${step.title}`}
                step={step}
                disabled={busy}
                onChange={(input) =>
                  mutate(() => endpoints.update(`goals/${goal._id}/steps`, step._id, input))
                }
                onRemove={() => {
                  if (window.confirm(t('goals:unified.confirmRemoveStep')))
                    mutate(() => endpoints.remove(`goals/${goal._id}/steps`, step._id));
                }}
              />
            ))}
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (
                  await mutate(() =>
                    endpoints.create(`goals/${goal._id}/steps`, { title: stepTitle.trim() }),
                  )
                )
                  setStepTitle('');
              }}
            >
              <input
                required
                maxLength={240}
                aria-label={t('goals:unified.newStep')}
                placeholder={t('goals:unified.newStep')}
                className="field min-w-0 flex-1"
                value={stepTitle}
                disabled={busy}
                onChange={(event) => setStepTitle(event.target.value)}
              />
              <button
                className="btn-secondary shrink-0"
                disabled={busy || !stepTitle.trim()}
                aria-label={t('goals:unified.addStep')}
              >
                <Plus size={18} />
              </button>
            </form>
          </section>
        )}
        <label className="block">
          <span className="label">{t('goals:unified.status')}</span>
          <select
            className="field"
            disabled={busy}
            value={goal.status}
            onChange={(event) =>
              mutate(() => endpoints.update('goals', goal._id, { status: event.target.value }))
            }
          >
            {['active', 'completed', 'paused', 'cancelled'].map((status) => (
              <option key={status} value={status}>
                {t(`common:values.${status}`)}
              </option>
            ))}
          </select>
        </label>
        {allowed('reminders') && (
          <Link
            className="block text-sm text-primary"
            to={`/panel/reminders?entityType=goal&entityId=${goal._id}`}
          >
            {t('navigation:reminders')}
          </Link>
        )}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button disabled={busy} className="btn-secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} />
            {t('goals:unified.editGoal')}
          </button>
          <button
            disabled={busy}
            className="icon-btn text-danger"
            aria-label={t('goals:unified.deleteGoal')}
            onClick={remove}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
