import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { endpoints } from '../../api/client.js';
import { useApp } from '../../context/useApp.js';
import { Modal } from '../ui.jsx';
import { goalProgressType } from '../../../../shared/goalProgress.js';

export function GoalForm({ goal, onClose, onSaved }) {
  const { t } = useTranslation();
  const { toast, reward } = useApp();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: goal?.title || '',
    progressType: goal ? goalProgressType(goal) : 'simple',
    targetAmount: goal?.targetAmount ?? '',
    currentAmount: goal?.currentAmount ?? '',
    targetDate: goal?.targetDate?.slice(0, 10) || '',
    description: goal?.description || '',
    notes: goal?.notes || '',
    url: goal?.url || '',
    priority: goal?.priority || 'medium',
    reminderMode: goal?.reminderMode || 'automatic',
  });
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const trackingLocked = Boolean(
    goal && (goal.hasSavingsHistory || goal.currentAmount > 0 || goal.steps?.length),
  );
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, title: form.title.trim(), targetDate: form.targetDate || null };
      delete payload.currentAmount;
      delete payload.targetAmount;
      if (form.progressType === 'money') {
        if (form.targetAmount !== '') payload.targetAmount = Number(form.targetAmount);
        else if (goal) payload.targetAmount = null;
        if (!goal?.hasSavingsHistory) payload.currentAmount = Number(form.currentAmount || 0);
      }
      const response = goal
        ? await endpoints.update('goals', goal._id, payload)
        : await endpoints.create('goals', payload);
      if (!goal) reward('GOAL_CREATED');
      onSaved(response.data);
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={t(goal ? 'goals:unified.editGoal' : 'goals:unified.addGoal')}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">{t('goals:ui.goalTitle')}</span>
          <input
            autoFocus
            required
            maxLength={240}
            className="field"
            value={form.title}
            onChange={set('title')}
          />
        </label>
        <fieldset disabled={trackingLocked}>
          <legend className="label">{t('goals:unified.progressMethod')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {['money', 'steps', 'simple'].map((type) => (
              <label
                key={type}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.progressType === type ? 'border-primary bg-selected text-primary' : 'border-border'}`}
              >
                <input
                  type="radio"
                  name="progressType"
                  value={type}
                  checked={form.progressType === type}
                  onChange={set('progressType')}
                />
                {t(`goals:unified.methods.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {form.progressType === 'money' && (
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">{t('goals:ui.targetAmount')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field"
                value={form.targetAmount}
                onChange={set('targetAmount')}
              />
            </label>
            <label>
              <span className="label">{t('goals:ui.alreadySaved')}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={goal?.hasSavingsHistory}
                className="field"
                value={form.currentAmount}
                onChange={set('currentAmount')}
              />
            </label>
          </div>
        )}
        <label className="block">
          <span className="label">{t('goals:unified.deadline')}</span>
          <input
            type="date"
            className="field"
            value={form.targetDate}
            onChange={set('targetDate')}
          />
        </label>
        <details>
          <summary className="cursor-pointer text-sm text-muted">
            {t('goals:unified.moreOptions')}
          </summary>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="label">{t('goals:ui.description')}</span>
              <textarea
                className="field h-auto py-2"
                rows={3}
                value={form.description}
                onChange={set('description')}
              />
            </label>
            <label className="block">
              <span className="label">{t('goals:unified.notes')}</span>
              <textarea
                className="field h-auto py-2"
                rows={2}
                value={form.notes}
                onChange={set('notes')}
              />
            </label>
            <label className="block">
              <span className="label">{t('goals:unified.url')}</span>
              <input
                type="url"
                dir="ltr"
                className="field"
                value={form.url}
                onChange={set('url')}
              />
            </label>
            <label className="block">
              <span className="label">{t('goals:unified.priority')}</span>
              <select className="field" value={form.priority} onChange={set('priority')}>
                {['low', 'medium', 'high'].map((value) => (
                  <option key={value} value={value}>
                    {t(`common:values.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('navigation:reminders')}</span>
              <select className="field" value={form.reminderMode} onChange={set('reminderMode')}>
                {['automatic', 'custom', 'off'].map((value) => (
                  <option key={value} value={value}>
                    {t(`goals:ui.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>
        <button disabled={busy || !form.title.trim()} className="btn-primary w-full">
          {t(busy ? 'common:saving' : 'goals:ui.save')}
        </button>
      </form>
    </Modal>
  );
}
