import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CreditCard, Plus } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { displayValue, formatDate, formatMoney, todayInput } from '../utils/format.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { AnimatedList } from '../animations/AnimatedList.jsx';
import Goals from './Goals.jsx';

const config = {
  bills: { icon: CreditCard },
  subscriptions: { icon: Bell },
};

function ItemForm({ kind, open, onClose, onSaved }) {
  const { t: _t } = useTranslation();
  const { settings, toast } = useApp();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const defaults =
    kind === 'bills'
      ? {
          name: '',
          amount: '',
          category: 'Bills',
          accountId: '',
          dueDate: todayInput(),
          autoCreateExpense: true,
          reminderMode: 'automatic',
        }
      : {
          name: '',
          amount: '',
          currency: settings.defaultCurrency || 'DZD',
          billingCycle: 'monthly',
          nextBillingDate: todayInput(),
          accountId: '',
          category: 'Subscriptions',
          website: '',
          reminderMode: 'automatic',
        };
  const [form, setForm] = useState(defaults);
  useEffect(() => {
    if (open && kind !== 'goals')
      endpoints.list('accounts').then((r) => {
        setAccounts(r.data);
        setForm((v) => ({ ...v, accountId: v.accountId || r.data[0]?._id || '' }));
      });
  }, [open, kind]);
  const set = (key) => (e) =>
    setForm((v) => ({
      ...v,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await endpoints.create(kind, form);
      toast(_t('common:dynamic.itemCreated', { item: _t(`goals:sections.${kind}.singular`) }));
      onSaved();
      onClose();
      if (form.reminderMode === 'custom')
        navigate(`/panel/reminders?entityType=${kind.slice(0, -1)}&entityId=${result.data._id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={_t('common:dynamic.addItem', { item: _t(`goals:sections.${kind}.singular`) })}
      description={_t('goals:ui.aFewDetailsNowLessMentalLoadLater')}
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">{_t('common:name')}</span>
          <input required autoFocus className="field" value={form.name} onChange={set('name')} />
        </label>
        <>
          <label>
            <span className="label">{_t('goals:ui.amount')}</span>
            <input
              required
              type="number"
              min="0.01"
              className="field text-lg font-bold"
              value={form.amount}
              onChange={set('amount')}
            />
          </label>
          <label>
            <span className="label">{_t('common:account')}</span>
            <select className="field" value={form.accountId} onChange={set('accountId')}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'bills' ? (
            <>
              <label>
                <span className="label">{_t('goals:ui.dueDate')}</span>
                <input
                  type="date"
                  className="field"
                  value={form.dueDate}
                  onChange={set('dueDate')}
                />
              </label>
              <label className="flex items-center gap-3 rounded-xl bg-surface-alt p-3 text-sm ">
                <input
                  type="checkbox"
                  checked={form.autoCreateExpense}
                  onChange={set('autoCreateExpense')}
                />
                {_t('goals:ui.createAnExpenseWhenMarkedPaid')}
              </label>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="label">{_t('goals:ui.billingCycle')}</span>
                  <select
                    className="field"
                    value={form.billingCycle}
                    onChange={set('billingCycle')}
                  >
                    <option value="weekly">{_t('goals:ui.weekly')}</option>
                    <option value="monthly">{_t('goals:ui.monthly')}</option>
                    <option value="quarterly">{_t('goals:ui.quarterly')}</option>
                    <option value="yearly">{_t('goals:ui.yearly')}</option>
                    <option value="custom">{_t('goals:ui.custom')}</option>
                  </select>
                </label>
                <label>
                  <span className="label">{_t('goals:ui.nextRenewal')}</span>
                  <input
                    type="date"
                    className="field"
                    value={form.nextBillingDate}
                    onChange={set('nextBillingDate')}
                  />
                </label>
              </div>
              <label>
                <span className="label">{_t('goals:ui.website')}</span>
                <input
                  type="url"
                  className="field"
                  value={form.website}
                  onChange={set('website')}
                  placeholder="https://"
                />
              </label>
            </>
          )}
        </>
        <label>
          <span className="label">{_t('navigation:reminders')}</span>
          <select className="field" value={form.reminderMode} onChange={set('reminderMode')}>
            <option value="automatic">{_t('goals:ui.automatic')}</option>
            <option value="custom">{_t('goals:ui.custom')}</option>
            <option value="off">{_t('goals:ui.off')}</option>
          </select>
          <span className="mt-1 block text-xs text-muted">
            {form.reminderMode === 'automatic'
              ? _t('goals:ui.smartRemindersAreCreatedAfterSaving')
              : form.reminderMode === 'custom'
                ? _t('goals:ui.addYourOwnRemindersAfterSaving')
                : _t('goals:ui.noAutomaticReminders')}
          </span>
        </label>
        <button disabled={busy} className="btn-primary w-full">
          {busy ? _t('common:saving') : _t('goals:ui.save')}
        </button>
      </form>
    </Modal>
  );
}

export default function Planning({ kind }) {
  return kind === 'goals' ? <Goals /> : <PlanningItems kind={kind} />;
}

function PlanningItems({ kind }) {
  const { t: _t } = useTranslation();
  const { settings, toast } = useApp();
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useData(() => endpoints.list(kind), [kind]);
  const items = data?.data || [];
  const details = config[kind];
  const Icon = details.icon;
  const monthly =
    kind === 'subscriptions'
      ? items.reduce(
          (sum, item) =>
            sum +
            item.amount *
              ({ weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, custom: 1 }[
                item.billingCycle
              ] || 1),
          0,
        )
      : 0;
  async function markPaid(item) {
    try {
      await endpoints.create(`bills/${item._id}/pay`, {});
      toast(_t('goals:ui.billPaidAndLedgerUpdated'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={_t(`goals:sections.${kind}.eyebrow`)}
        title={_t(`goals:sections.${kind}.title`)}
        description={_t(`goals:sections.${kind}.description`)}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            {_t('common:dynamic.addItem', { item: _t(`goals:sections.${kind}.singular`) })}
          </button>
        }
      />
      {kind === 'subscriptions' && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <article className="panel-flat p-5">
            <p className="text-xs text-muted">{_t('goals:ui.monthlyEquivalent')}</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatMoney(monthly, settings.defaultCurrency)}
            </p>
          </article>
          <article className="panel-flat p-5">
            <p className="text-xs text-muted">{_t('goals:ui.annualRunRate')}</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatMoney(monthly * 12, settings.defaultCurrency)}
            </p>
          </article>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState
          icon={Icon}
          title={_t('common:dynamic.itemUnavailable', { item: _t(`goals:sections.${kind}.title`) })}
          description={error}
        />
      ) : (
        <>
          {items.length === 0 && (
            <div className="panel">
              <EmptyState
                icon={Icon}
                title={_t('common:dynamic.noItemsYet', {
                  item: _t(`goals:sections.${kind}.title`),
                })}
                description={_t('goals:ui.addTheFirstOneWhenYouAreReady')}
                action={
                  <button className="btn-primary" onClick={() => setOpen(true)}>
                    {_t('goals:ui.addOne')}
                  </button>
                }
              />
            </div>
          )}
          {
            <section className="panel overflow-hidden">
              <AnimatedList
                items={items}
                renderItem={(item) => (
                  <article className="flex flex-col gap-3 border-b border-border p-4 last:border-0  sm:flex-row sm:items-center sm:p-5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-alt text-muted ">
                      {kind === 'bills' ? <CreditCard size={18} /> : <Bell size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold">{item.name}</h3>
                      <Link
                        className="text-xs font-semibold text-primary"
                        to={`/panel/reminders?entityType=${kind.slice(0, -1)}&entityId=${item._id}`}
                      >
                        🔔 {displayValue(item.reminderMode || 'automatic')}{' '}
                        {_t('goals:ui.reminders')}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {kind === 'bills'
                          ? _t('goals:dueOn', { date: formatDate(item.dueDate) })
                          : _t('goals:renewsOn', {
                              cycle: displayValue(item.billingCycle),
                              date: formatDate(item.nextBillingDate),
                            })}
                      </p>
                    </div>
                    <div className="sm:text-end">
                      <p className="font-display text-lg font-bold">
                        {formatMoney(item.amount, item.currency || settings.defaultCurrency)}
                      </p>
                      <StatusBadge
                        tone={
                          item.status === 'paid'
                            ? 'success'
                            : item.status === 'overdue'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {item.status}
                      </StatusBadge>
                    </div>
                    {kind === 'bills' && item.status !== 'paid' && (
                      <button className="btn-secondary h-9" onClick={() => markPaid(item)}>
                        <Check size={15} />
                        {_t('goals:ui.markPaid')}
                      </button>
                    )}
                  </article>
                )}
              />
            </section>
          }
        </>
      )}
      <ItemForm
        key={kind}
        kind={kind}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={reload}
      />
    </>
  );
}
