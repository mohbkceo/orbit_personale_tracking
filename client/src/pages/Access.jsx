import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../utils/format.js';
import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Access() {
  const { t: _t } = useTranslation();
  const { loading, user, access, logout } = useAuth();
  const [key, setKey] = useState('');
  const [orders, setOrders] = useState([]);
  useEffect(() => { if (user) api.get('/payments/orders').then((result) => setOrders(result.data)).catch(() => {}); }, [user]);
  if (loading) return <Spinner label={_t('auth:checkingAccess')} />;
  if (!user) return <Navigate to="/login" replace />;
  if (access?.eligible) return <Navigate to="/panel" replace />;
  const suspended = access?.reason === 'SUSPENDED';
  const expired = access?.reason === 'EXPIRED';
  const subscription = access?.subscription;
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="panel w-full max-w-lg p-8">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">{_t('checkout:ui.orbitAccess')}</span>
        <h1 className="mt-3 font-display text-3xl font-bold">
          {suspended
            ? _t('checkout:ui.yourAccountIsSuspended')
            : expired
              ? _t('checkout:ui.yourOrbitAccessHasExpired')
              : _t('checkout:ui.activateYourOrbitAccess')}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {suspended
            ? _t('checkout:ui.contactAnOrbitAdministratorForHelpSuspensionDoesNotPauseYourAcce')
            : _t('checkout:ui.chooseASubscriptionPlanOrRedeemAnActivationLinkToOpenYourWorkspa')}
        </p>
        {subscription && (
          <div className="mt-6 rounded-xl border border-border bg-surface-alt p-4 text-sm">
            <p className="font-bold">{subscription.planSnapshot?.name || _t('checkout:ui.accessPlan')}</p>
            <p className="mt-1 text-muted">
              {expired ? _t('checkout:ui.expired') : _t('checkout:ui.expires')} {formatDateTime(subscription.expiresAt)}
            </p>
          </div>
        )}
        {!suspended && (
          <form
            className="mt-6 flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const value = key.trim().split('/').pop();
              if (value) window.location.href = `/activate/${encodeURIComponent(value)}`;
            }}
          >
            <input
              className="field min-w-0"
              placeholder={_t('checkout:ui.pasteActivationLinkOrKey')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn-primary">{_t('checkout:ui.redeem')}</button>
          </form>
        )}
        {!suspended && <Link to="/pricing" className="btn-primary mt-5">{_t('checkout:ui.chooseAPlan')}</Link>}
        {orders.filter((order) => ['PENDING', 'PROCESSING', 'PAID'].includes(order.state)).slice(0, 3).map((order) => <Link key={order.id} to={`/checkout?order=${order.id}`} className="mt-3 block text-sm text-primary underline">{order.state === 'PAID' ? _t('checkout:ui.viewPayment') : _t('checkout:ui.resumeOrder')}: {order.plan.name} · {order.state.toLowerCase()}</Link>)}
        <div className="mt-7 flex items-center justify-between text-sm">
          <span>{user.fullName}</span>
          <button onClick={logout} className="text-primary underline">{_t('common:logout')}</button>
        </div>
        <Link to="/login" className="sr-only">{_t('checkout:ui.login')}</Link>
      </div>
    </main>
  );
}
