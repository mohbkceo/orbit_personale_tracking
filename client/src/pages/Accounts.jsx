import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Archive, Landmark, Plus, Wallet, WalletCards } from 'lucide-react';
import { endpoints } from '../api/client.js';
import { useApp } from '../context/useApp.js';
import { useData } from '../hooks/useData.js';
import { formatMoney } from '../utils/format.js';
import { EmptyState, Modal, PageHeader, Spinner, StatusBadge } from '../components/ui.jsx';
import { AnimatedList } from '../animations/AnimatedList.jsx';

const colors = ['#ff6b25', '#2563eb', '#7c3aed', '#dc6b5d', '#c18b2b'];
function AccountForm({ open, onClose, onSaved }) {
  const { t: _t } = useTranslation();
  const { toast, settings } = useApp();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'bank',
    currency: settings.defaultCurrency || 'DZD',
    openingBalance: 0,
    color: colors[0],
  });
  const set = (k) => (e) => setForm((v) => ({ ...v, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await endpoints.create('accounts', form);
      toast(_t('finance:ui.accountCreated'));
      onSaved();
      onClose();
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
      title={_t('finance:ui.addAccount')}
      description={_t('finance:ui.openingBalanceBecomesTheStartingPointForThisLedger')}
    >
      <form onSubmit={submit} className="space-y-4">
        <label>
          <span className="label">{_t('finance:ui.accountName')}</span>
          <input
            required
            autoFocus
            className="field"
            value={form.name}
            onChange={set('name')}
            placeholder={_t('finance:ui.eGMainBank')}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{_t('finance:ui.type')}</span>
            <select className="field" value={form.type} onChange={set('type')}>
              <option value="cash">{_t('finance:ui.cash')}</option>
              <option value="bank">{_t('finance:ui.bank')}</option>
              <option value="savings">{_t('finance:ui.savings')}</option>
              <option value="wallet">{_t('finance:ui.wallet')}</option>
              <option value="other">{_t('finance:ui.other')}</option>
            </select>
          </label>
          <label>
            <span className="label">{_t('finance:ui.currency')}</span>
            <input
              required
              maxLength="3"
              className="field uppercase"
              value={form.currency}
              onChange={set('currency')}
            />
          </label>
        </div>
        <label>
          <span className="label">{_t('finance:ui.openingBalance')}</span>
          <input
            type="number"
            step="0.01"
            className="field"
            value={form.openingBalance}
            onChange={set('openingBalance')}
          />
        </label>
        <div>
          <span className="label">{_t('finance:ui.color')}</span>
          <div className="flex gap-2">
            {colors.map((color) => (
              <button
                type="button"
                key={color}
                onClick={() => setForm((v) => ({ ...v, color }))}
                className={`h-9 w-9 rounded-full ${form.color === color ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : ''}`}
                style={{ background: color }}
              />
            ))}
          </div>
        </div>
        <button disabled={busy} className="btn-primary w-full">
          {busy ? _t('finance:ui.creating') : _t('finance:ui.createAccount')}
        </button>
      </form>
    </Modal>
  );
}

export default function Accounts() {
  const { t: _t } = useTranslation();
  const { toast, settings } = useApp();
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useData(() => endpoints.list('accounts'), []);
  const accounts = data?.data || [];
  const total = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  async function archive(account) {
    if (!window.confirm(_t('common:dynamic.archiveAccount', { name: account.name }))) return;
    try {
      await endpoints.create(`accounts/${account._id}/archive`, {});
      toast(_t('finance:ui.accountArchived'));
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={_t('finance:title')}
        title={_t('navigation:accounts')}
        description={_t('finance:ui.yourWalletsAndBalancesReconstructedFromTheSourceLedger')}
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={17} />
            {_t('finance:ui.addAccount')}
          </button>
        }
      />
      <div className="panel mb-5 flex items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">
            {_t('finance:ui.totalAcrossActiveAccounts')}
          </p>
          <p className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">
            {formatMoney(total, settings.defaultCurrency)}
          </p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-selected text-primary">
          <WalletCards size={22} />
        </span>
      </div>
      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState
          icon={Wallet}
          title={_t('finance:ui.accountsUnavailable')}
          description={error}
        />
      ) : (
        <>
          {accounts.length === 0 && (
            <EmptyState
              icon={Wallet}
              title={_t('finance:ui.createYourFirstAccount')}
              description={_t('finance:ui.addCashABankAccountOrASavingsWallet')}
              action={
                <button className="btn-primary" onClick={() => setOpen(true)}>
                  {_t('finance:ui.addAccount')}
                </button>
              }
            />
          )}
          <AnimatedList
            as="section"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            items={accounts}
            renderItem={(account) => (
              <article key={account._id} className="panel group overflow-hidden">
                <div className="p-5">
                  <div className="mb-5 flex items-start justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-selected text-primary">
                      {account.type === 'bank' ? <Landmark size={20} /> : <Wallet size={20} />}
                    </span>
                    <button
                      className="icon-btn opacity-50 group-hover:opacity-100"
                      onClick={() => archive(account)}
                      aria-label={_t('finance:ui.archiveAccount')}
                    >
                      <Archive size={16} />
                    </button>
                  </div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: account.color }}
                    />
                    {account.name}
                  </p>
                  <p className="mt-1 font-display text-2xl font-bold">
                    {formatMoney(account.currentBalance, account.currency)}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <StatusBadge>{account.type}</StatusBadge>
                    <p className="text-[10px] text-muted">
                      {_t('finance:ui.opening')}{' '}
                      {formatMoney(account.openingBalance, account.currency)}
                    </p>
                  </div>
                </div>
              </article>
            )}
          />
        </>
      )}
      <AccountForm open={open} onClose={() => setOpen(false)} onSaved={reload} />
    </>
  );
}
