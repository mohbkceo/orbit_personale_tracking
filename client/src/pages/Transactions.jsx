import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Download,
  Plus,
  ReceiptText,
  Search,
  Trash2,
} from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { cn, displayValue, formatDate, formatMoney, todayInput } from '../utils/format.js';
import { EmptyState, Modal, Money, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { AnimatedList } from '../animations/AnimatedList.jsx';
import { AnimatedNumber } from '../animations/AnimatedNumber.jsx';

function TransactionForm({ open, onClose, mode, onSaved }) {
  const { t: _t } = useTranslation();
  const { settings, toast, reward } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    type: mode === 'all' ? 'expense' : mode,
    amount: '',
    description: '',
    accountId: '',
    destinationAccountId: '',
    category: 'Other',
    date: todayInput(),
    notes: '',
  });
  useEffect(() => {
    if (open)
      endpoints.list('accounts').then((r) => {
        setAccounts(r.data);
        setForm((v) => ({
          ...v,
          accountId: v.accountId || r.data[0]?._id || '',
          destinationAccountId: v.destinationAccountId || r.data[1]?._id || '',
        }));
      });
  }, [open]);
  const set = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  const transfer = ['transfer', 'savings_contribution', 'savings_withdrawal'].includes(form.type);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await endpoints.create('transactions', {
        ...form,
        destinationAccountId: transfer ? form.destinationAccountId : null,
      });
      toast(_t('finance:ui.transactionRecorded'));
      if (form.type === 'income') reward('INCOME_RECORDED');
      if (form.type === 'expense') reward('EXPENSE_RECORDED');
      if (form.type === 'savings_contribution') reward('SAVINGS_CONTRIBUTED');
      onSaved();
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={_t('finance:ui.recordTransaction')}
      description={_t('finance:ui.balancesUpdateFromThisLedgerAutomatically')}
    >
      <form className="space-y-4" onSubmit={submit}>
        <label>
          <span className="label">{_t('finance:ui.type')}</span>
          <select className="field" value={form.type} onChange={set('type')}>
            <option value="expense">{_t('finance:ui.expense')}</option>
            <option value="income">{_t('navigation:income')}</option>
            <option value="transfer">{_t('finance:ui.transfer')}</option>
            <option value="savings_contribution">{_t('finance:ui.savingsContribution')}</option>
            <option value="savings_withdrawal">{_t('finance:ui.savingsWithdrawal')}</option>
            <option value="adjustment">{_t('finance:ui.balanceAdjustment')}</option>
          </select>
        </label>
        <label>
          <span className="label">{_t('finance:ui.amount')}</span>
          <input
            required
            autoFocus
            type="number"
            min="0.01"
            step="0.01"
            className="field text-lg font-bold"
            value={form.amount}
            onChange={set('amount')}
            placeholder="0"
          />
        </label>
        <label>
          <span className="label">{_t('finance:ui.description')}</span>
          <input
            required
            className="field"
            value={form.description}
            onChange={set('description')}
            placeholder={_t('finance:ui.whatIsThisFor')}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">
              {transfer ? _t('finance:ui.fromAccount') : _t('common:account')}
            </span>
            <select required className="field" value={form.accountId} onChange={set('accountId')}>
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {transfer ? (
            <label>
              <span className="label">{_t('finance:ui.toAccount')}</span>
              <select
                required
                className="field"
                value={form.destinationAccountId}
                onChange={set('destinationAccountId')}
              >
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span className="label">{_t('finance:ui.date')}</span>
              <input type="date" className="field" value={form.date} onChange={set('date')} />
            </label>
          )}
        </div>
        <label>
          <span className="label">{_t('finance:ui.category')}</span>
          <input
            className="field"
            list="transaction-categories"
            value={form.category}
            onChange={set('category')}
          />
          <datalist id="transaction-categories">
            {[...(settings.expenseCategories || []), ...(settings.incomeCategories || [])].map(
              (v) => (
                <option key={v} value={v} />
              ),
            )}
          </datalist>
        </label>
        <label>
          <span className="label">
            {_t('navigation:notes')}{' '}
            <span className="normal-case tracking-normal text-muted">
              {_t('finance:ui.optional')}
            </span>
          </span>
          <textarea
            className="field h-auto py-3"
            rows="2"
            value={form.notes}
            onChange={set('notes')}
          />
        </label>
        <button disabled={busy} className="btn-primary w-full">
          {busy ? _t('finance:ui.recording') : _t('finance:ui.recordTransaction')}
        </button>
      </form>
    </Modal>
  );
}

export default function Transactions({ mode = 'all' }) {
  const { t: _t } = useTranslation();
  const { settings, toast } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const loader = useMemo(
    () => () =>
      endpoints.list('transactions', {
        type: mode === 'all' ? undefined : mode,
        search: query || undefined,
        category: category || undefined,
        limit: 100,
      }),
    [mode, query, category],
  );
  const { data, loading, error, reload } = useData(loader, [loader]);
  const rows = useMemo(() => data?.data || [], [data]);
  const currency = settings.defaultCurrency || 'DZD';
  const totals = useMemo(
    () =>
      rows.reduce(
        (value, item) => {
          if (['income', 'debt_payment_in'].includes(item.type)) value.in += item.amount;
          if (['expense', 'debt_payment_out'].includes(item.type)) value.out += item.amount;
          return value;
        },
        { in: 0, out: 0 },
      ),
    [rows],
  );
  async function remove(item) {
    if (!window.confirm(_t('common:dynamic.archiveNamed', { name: item.description }))) return;
    try {
      await endpoints.remove('transactions', item._id);
      toast(_t('finance:ui.transactionArchived'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  const exportUrl = `/api/export/transactions?format=csv`;
  return (
    <>
      <PageHeader
        eyebrow={_t('finance:title')}
        title={_t(`finance:modes.${mode}.title`)}
        description={_t(`finance:modes.${mode}.description`)}
        actions={
          <>
            <a href={exportUrl} className="btn-secondary hidden sm:inline-flex">
              <Download size={16} />
              CSV
            </a>
            <button className="btn-primary" onClick={() => setFormOpen(true)}>
              <Plus size={17} />
              {_t('common:add')}
            </button>
          </>
        }
      />
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="panel-flat p-4">
          <p className="text-xs font-medium text-muted">{_t('finance:ui.visibleInflow')}</p>
          <span className="mt-2 block font-display text-xl font-bold text-success">
            <AnimatedNumber value={totals.in} format={(value) => formatMoney(value, currency)} />
          </span>
        </div>
        <div className="panel-flat p-4">
          <p className="text-xs font-medium text-muted">{_t('finance:ui.visibleOutflow')}</p>
          <Money
            value={totals.out}
            currency={currency}
            className="mt-2 block font-display text-xl font-bold text-danger"
          />
        </div>
        <div className="panel-flat p-4">
          <p className="text-xs font-medium text-muted">{_t('finance:ui.difference')}</p>
          <Money
            value={totals.in - totals.out}
            currency={currency}
            signed
            className="mt-2 block font-display text-xl font-bold"
          />
        </div>
      </section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute start-3.5 top-3 text-muted" size={17} />
          <input
            className="field ps-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={_t('finance:ui.searchDescriptionOrCategory')}
          />
        </div>
        <select
          className="field sm:w-48"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{_t('finance:ui.allCategories')}</option>
          {[...(settings.expenseCategories || []), ...(settings.incomeCategories || [])]
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((v) => (
              <option key={v}>{v}</option>
            ))}
        </select>
      </div>
      <section className="panel overflow-hidden">
        <div className="hidden grid-cols-[1fr_150px_130px_130px_50px] border-b border-border bg-surface-alt px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted md:grid">
          <span>{_t('finance:ui.description')}</span>
          <span>{_t('common:account')}</span>
          <span>{_t('finance:ui.date')}</span>
          <span className="text-end">{_t('finance:ui.amount')}</span>
          <span />
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <EmptyState
            icon={ReceiptText}
            title={_t('finance:ui.couldNotLoadTheLedger')}
            description={error}
            action={
              <button className="btn-primary" onClick={reload}>
                {_t('finance:ui.tryAgain')}
              </button>
            }
          />
        ) : (
          <>
            {rows.length === 0 && (
              <EmptyState
                icon={ReceiptText}
                title={_t('finance:ui.noMatchingTransactions')}
                description={_t('finance:ui.recordAMoneyMovementToBeginYourLedger')}
                action={
                  <button className="btn-primary" onClick={() => setFormOpen(true)}>
                    {_t('finance:ui.recordTransaction')}
                  </button>
                }
              />
            )}
            <AnimatedList
              items={rows}
              renderItem={(item) => {
                const positive = ['income', 'debt_payment_in'].includes(item.type);
                const transfer = [
                  'transfer',
                  'savings_contribution',
                  'savings_withdrawal',
                ].includes(item.type);
                const Icon = transfer ? ArrowLeftRight : positive ? ArrowUpRight : ArrowDownLeft;
                return (
                  <article
                    key={item._id}
                    className="group grid gap-3 border-b border-border px-4 py-4 last:border-0  md:grid-cols-[1fr_150px_130px_130px_50px] md:items-center md:px-5"
                  >
                    <div className="flex min-w-0 gap-3">
                      <span
                        className={cn(
                          'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                          positive
                            ? 'bg-success/10 text-success '
                            : transfer
                              ? 'bg-surface-alt text-primary '
                              : 'bg-danger/10 text-danger ',
                        )}
                      >
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.description}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge>{item.category}</StatusBadge>
                          <span className="text-[10px] capitalize text-muted">
                            {displayValue(item.type)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {item.accountId?.name}
                      {item.destinationAccountId ? <> <span aria-hidden="true">→</span> {item.destinationAccountId.name}</> : ''}
                    </p>
                    <p className="text-xs text-muted">{formatDate(item.date)}</p>
                    <p
                      className={cn(
                        'text-end text-sm font-bold',
                        positive && 'text-success',
                        !positive && !transfer && 'text-danger',
                      )}
                    >
                      {positive ? '+' : transfer ? '' : '−'}
                      {formatMoney(item.amount, currency)}
                    </p>
                    <button
                      className="icon-btn opacity-50 group-hover:opacity-100"
                      aria-label={_t('common:delete')}
                      onClick={() => remove(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              }}
            />
          </>
        )}
      </section>
      <TransactionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
        mode={mode}
      />
    </>
  );
}
