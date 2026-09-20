import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CreditCard, Goal as GoalIcon, Plus, Sparkles } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { formatDate, formatMoney, todayInput } from '../utils/format.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';

const config = {
  bills: {
    eyebrow: 'Planning',
    title: 'Bills',
    description: 'Know what is due before it becomes urgent.',
    icon: CreditCard,
  },
  subscriptions: {
    eyebrow: 'Planning',
    title: 'Subscriptions',
    description: 'Recurring costs, translated into their real monthly weight.',
    icon: Bell,
  },
  goals: {
    eyebrow: 'Growth',
    title: 'Goals & savings',
    description: 'Turn intent into measurable, visible progress.',
    icon: GoalIcon,
  },
};

function ItemForm({ kind, open, onClose, onSaved }) {
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
      : kind === 'subscriptions'
        ? {
            name: '',
            amount: '',
            currency: settings.defaultCurrency || 'DZD',
            billingCycle: 'monthly',
            nextBillingDate: todayInput(),
            accountId: '',
            category: 'Subscriptions',
            website: '',
            reminderMode: 'automatic',
          }
        : {
            title: '',
            type: 'financial',
            targetAmount: '',
            currentAmount: 0,
            targetDate: '',
            description: '',
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
      toast(`${config[kind].title.slice(0, -1)} created`);
      onSaved();
      onClose();
      if (form.reminderMode === 'custom') navigate(`/reminders?entityType=${kind.slice(0, -1)}&entityId=${result.data._id}`);
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
      title={`Add ${kind === 'goals' ? 'goal' : kind.slice(0, -1)}`}
      description="A few details now, less mental load later"
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">{kind === 'goals' ? 'Goal title' : 'Name'}</span>
          <input
            required
            autoFocus
            className="field"
            value={form.title ?? form.name}
            onChange={set(kind === 'goals' ? 'title' : 'name')}
          />
        </label>
        {kind === 'goals' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">Type</span>
                <select className="field" value={form.type} onChange={set('type')}>
                  <option value="financial">Financial</option>
                  <option value="personal">Personal</option>
                </select>
              </label>
              <label>
                <span className="label">Target date</span>
                <input
                  type="date"
                  className="field"
                  value={form.targetDate}
                  onChange={set('targetDate')}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className="label">Target amount</span>
                <input
                  type="number"
                  min="0"
                  className="field"
                  value={form.targetAmount}
                  onChange={set('targetAmount')}
                />
              </label>
              <label>
                <span className="label">Already saved</span>
                <input
                  type="number"
                  min="0"
                  className="field"
                  value={form.currentAmount}
                  onChange={set('currentAmount')}
                />
              </label>
            </div>
            <label>
              <span className="label">Description</span>
              <textarea
                rows="2"
                className="field h-auto py-3"
                value={form.description}
                onChange={set('description')}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span className="label">Amount</span>
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
              <span className="label">Account</span>
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
                  <span className="label">Due date</span>
                  <input
                    type="date"
                    className="field"
                    value={form.dueDate}
                    onChange={set('dueDate')}
                  />
                </label>
                <label className="flex items-center gap-3 rounded-xl bg-[#f4f7f2] p-3 text-sm dark:bg-white/5">
                  <input
                    type="checkbox"
                    checked={form.autoCreateExpense}
                    onChange={set('autoCreateExpense')}
                  />
                  Create an expense when marked paid
                </label>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="label">Billing cycle</span>
                    <select
                      className="field"
                      value={form.billingCycle}
                      onChange={set('billingCycle')}
                    >
                      <option>weekly</option>
                      <option>monthly</option>
                      <option>quarterly</option>
                      <option>yearly</option>
                      <option>custom</option>
                    </select>
                  </label>
                  <label>
                    <span className="label">Next renewal</span>
                    <input
                      type="date"
                      className="field"
                      value={form.nextBillingDate}
                      onChange={set('nextBillingDate')}
                    />
                  </label>
                </div>
                <label>
                  <span className="label">Website</span>
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
        )}
        <label><span className="label">Reminders</span><select className="field" value={form.reminderMode} onChange={set('reminderMode')}><option value="automatic">Automatic</option><option value="custom">Custom</option><option value="off">Off</option></select><span className="mt-1 block text-xs text-[#7b867f]">{form.reminderMode === 'automatic' ? 'Smart reminders are created after saving.' : form.reminderMode === 'custom' ? 'Add your own reminders after saving.' : 'No automatic reminders.'}</span></label>
        <button disabled={busy} className="btn-primary w-full">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}

function GoalCard({ item, currency, onManage }) {
  const progress = item.targetAmount
    ? Math.min((item.currentAmount / item.targetAmount) * 100, 100)
    : 0;
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf4ee] text-accent dark:bg-emerald-400/10">
          <Sparkles size={18} />
        </span>
        <StatusBadge tone={item.status === 'completed' ? 'success' : 'info'}>
          {item.status}
        </StatusBadge>
      </div>
      <h3 className="mt-5 font-display text-lg font-bold">{item.title}</h3>
      <Link className="mt-2 inline-block text-xs font-semibold text-accent" to={`/reminders?entityType=goal&entityId=${item._id}`}>🔔 {item.reminderMode || 'automatic'} reminders</Link>
      <p className="mt-1 line-clamp-2 text-xs text-[#7c8780]">
        {item.description || `Target ${formatDate(item.targetDate)}`}
      </p>
      <div className="mt-6 flex items-end justify-between">
        <p className="font-display text-xl font-bold">
          {formatMoney(item.currentAmount, currency)}
        </p>
        <p className="text-xs text-[#7c8780]">of {formatMoney(item.targetAmount, currency)}</p>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#e8ece6] dark:bg-white/10">
        <div
          className="h-full rounded-full bg-accent dark:bg-lime"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] font-bold text-[#768179]">{Math.round(progress)}%</p>
        {item.type === 'financial' && (
          <button className="btn-secondary h-8 px-3 text-xs" onClick={onManage}>
            Manage savings
          </button>
        )}
      </div>
    </article>
  );
}

function SavingsForm({ goal, onClose, onSaved }) {
  const { toast } = useApp();
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
    endpoints.list('accounts').then((response) => {
      setAccounts(response.data);
      setForm((value) => ({
        ...value,
        accountId: response.data[0]?._id || '',
        destinationAccountId: response.data[1]?._id || '',
      }));
    });
  }, [goal]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await endpoints.create(`goals/${goal._id}/${form.action}`, {
        amount: form.amount,
        accountId: form.accountId,
        destinationAccountId: form.destinationAccountId,
      });
      toast(
        form.action === 'contribute'
          ? 'Savings contribution recorded'
          : 'Savings withdrawal recorded',
      );
      onSaved();
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
      title="Manage savings"
      description={`${goal?.title} · ${formatMoney(goal?.currentAmount, goal?.currency || 'DZD')} saved`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setForm((v) => ({ ...v, action: 'contribute' }))}
            className={`rounded-xl border p-3 text-sm font-bold ${contributing ? 'border-accent bg-[#eff5f0] dark:bg-white/10' : 'border-[#dce1dc] dark:border-white/10'}`}
          >
            Contribute
          </button>
          <button
            type="button"
            onClick={() => setForm((v) => ({ ...v, action: 'withdraw' }))}
            className={`rounded-xl border p-3 text-sm font-bold ${!contributing ? 'border-accent bg-[#eff5f0] dark:bg-white/10' : 'border-[#dce1dc] dark:border-white/10'}`}
          >
            Withdraw
          </button>
        </div>
        <label>
          <span className="label">Amount</span>
          <input
            required
            autoFocus
            type="number"
            min="0.01"
            max={!contributing ? goal?.currentAmount : undefined}
            className="field text-lg font-bold"
            value={form.amount}
            onChange={set('amount')}
          />
        </label>
        <label>
          <span className="label">{contributing ? 'From account' : 'Savings account'}</span>
          <select required className="field" value={form.accountId} onChange={set('accountId')}>
            {accounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">{contributing ? 'Savings account' : 'To account'}</span>
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
        <p className="text-xs leading-5 text-[#7b867f]">
          This is recorded as a transfer between owned accounts, so it does not inflate income or
          expenses.
        </p>
        <button disabled={busy || accounts.length < 2} className="btn-primary w-full">
          {busy ? 'Recording…' : contributing ? 'Add contribution' : 'Record withdrawal'}
        </button>
      </form>
    </Modal>
  );
}

export default function Planning({ kind }) {
  const { settings, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(null);
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
      toast('Bill paid and ledger updated');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={details.eyebrow}
        title={details.title}
        description={details.description}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            Add {kind === 'goals' ? 'goal' : kind.slice(0, -1)}
          </button>
        }
      />
      {kind === 'subscriptions' && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <article className="panel-flat p-5">
            <p className="text-xs text-[#748078]">Monthly equivalent</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatMoney(monthly, settings.defaultCurrency)}
            </p>
          </article>
          <article className="panel-flat p-5">
            <p className="text-xs text-[#748078]">Annual run rate</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatMoney(monthly * 12, settings.defaultCurrency)}
            </p>
          </article>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon={Icon} title={`${details.title} unavailable`} description={error} />
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Icon}
            title={`No ${kind} yet`}
            description="Add the first one when you are ready."
            action={
              <button className="btn-primary" onClick={() => setOpen(true)}>
                Add one
              </button>
            }
          />
        </div>
      ) : kind === 'goals' ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <GoalCard
              key={item._id}
              item={item}
              currency={settings.defaultCurrency}
              onManage={() => setManaging(item)}
            />
          ))}
        </section>
      ) : (
        <section className="panel overflow-hidden">
          {items.map((item) => (
            <article
              key={item._id}
              className="flex flex-col gap-3 border-b border-[#edf0ec] p-4 last:border-0 dark:border-white/5 sm:flex-row sm:items-center sm:p-5"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f0f2ed] text-[#657168] dark:bg-white/10">
                {kind === 'bills' ? <CreditCard size={18} /> : <Bell size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-bold">{item.name}</h3>
                <Link className="text-xs font-semibold text-accent" to={`/reminders?entityType=${kind.slice(0, -1)}&entityId=${item._id}`}>🔔 {item.reminderMode || 'automatic'} reminders</Link>
                <p className="mt-1 text-xs text-[#808a84]">
                  {kind === 'bills'
                    ? `Due ${formatDate(item.dueDate)}`
                    : `${item.billingCycle} · renews ${formatDate(item.nextBillingDate)}`}
                </p>
              </div>
              <div className="sm:text-right">
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
                  Mark paid
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      <ItemForm
        key={kind}
        kind={kind}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={reload}
      />
      <SavingsForm goal={managing} onClose={() => setManaging(null)} onSaved={reload} />
    </>
  );
}
