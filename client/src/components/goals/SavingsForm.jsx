import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { endpoints } from '../../api/client.js';
import { useApp } from '../../context/useApp.js';
import { Modal } from '../ui.jsx';
import { formatMoney } from '../../utils/format.js';
import { crossedGoalMilestone } from '../../animations/rewardConfig.js';

export function SavingsForm({ goal, onClose, onSaved }) {
  const { t: _t } = useTranslation();
  const { toast, reward } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    action: 'contribute',
    amount: '',
    accountId: '',
    destinationAccountId: '',
  });
  useEffect(() => {
    if (!goal) return;
    endpoints
      .list('accounts')
      .then((response) => {
        setAccounts(response.data.filter((account) => account.currency === goal.currency));
        setForm((value) => ({
          ...value,
          accountId: response.data.find((account) => account.currency === goal.currency)?._id || '',
          destinationAccountId:
            response.data.filter((account) => account.currency === goal.currency)[1]?._id || '',
        }));
      })
      .catch((error) => toast(error.message, 'error'));
  }, [goal, toast]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await endpoints.create(`goals/${goal._id}/${form.action}`, {
        amount: form.amount,
        accountId: form.accountId,
        destinationAccountId: form.destinationAccountId,
      });
      toast(
        form.action === 'contribute'
          ? _t('goals:ui.savingsContributionRecorded')
          : _t('goals:ui.savingsWithdrawalRecorded'),
      );
      if (form.action === 'contribute') {
        const before = goal.targetAmount ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
        const after = goal.targetAmount ? (result.data.currentAmount / goal.targetAmount) * 100 : 0;
        reward(crossedGoalMilestone(before, after) || 'SAVINGS_CONTRIBUTED');
      }
      onSaved(result.data);
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const contributing = form.action === 'contribute';
  return (
    <Modal
      open={Boolean(goal)}
      onClose={onClose}
      title={_t('goals:ui.manageSavings')}
      description={_t('goals:savedAmount', {
        title: goal?.title,
        amount: formatMoney(goal?.currentAmount, goal?.currency || 'DZD'),
      })}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setForm((v) => ({ ...v, action: 'contribute' }))}
            className={`rounded-xl border p-3 text-sm font-semibold ${contributing ? 'border-primary bg-selected text-primary' : 'border-border bg-surface hover:bg-hover'}`}
          >
            {_t('goals:ui.contribute')}
          </button>
          <button
            type="button"
            onClick={() => setForm((v) => ({ ...v, action: 'withdraw' }))}
            className={`rounded-xl border p-3 text-sm font-semibold ${!contributing ? 'border-primary bg-selected text-primary' : 'border-border bg-surface hover:bg-hover'}`}
          >
            {_t('goals:ui.withdraw')}
          </button>
        </div>
        <label>
          <span className="label">{_t('goals:ui.amount')}</span>
          <input
            required
            autoFocus
            type="number"
            min="0.01"
            step="0.01"
            max={!contributing ? goal?.currentAmount : undefined}
            className="field text-lg font-bold"
            value={form.amount}
            onChange={set('amount')}
          />
        </label>
        <label>
          <span className="label">
            {contributing ? _t('goals:ui.fromAccount') : _t('goals:ui.savingsAccount')}
          </span>
          <select required className="field" value={form.accountId} onChange={set('accountId')}>
            {accounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">
            {contributing ? _t('goals:ui.savingsAccount') : _t('goals:ui.toAccount')}
          </span>
          <select
            required
            className="field"
            value={form.destinationAccountId}
            onChange={set('destinationAccountId')}
          >
            {accounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-5 text-muted">
          {_t('goals:ui.thisIsRecordedAsATransferBetweenOwnedAccountsSoItDoesNotInflateI')}
        </p>
        <button disabled={busy || accounts.length < 2} className="btn-primary w-full">
          {busy
            ? _t('goals:ui.recording')
            : contributing
              ? _t('goals:ui.addContribution')
              : _t('goals:ui.recordWithdrawal')}
        </button>
      </form>
    </Modal>
  );
}
