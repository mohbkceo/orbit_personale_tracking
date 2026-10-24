import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Field, Message, UserDialog } from './UserDialog.jsx';

const when = (value) => (value ? new Date(value).toLocaleString() : '—');
export function SubscriptionDialog({ id, data, management, onClose, onChanged }) {
  const grantKey = useRef(null);
  const [plans, setPlans] = useState([]);
  const [features, setFeatures] = useState([]);
  const [mode, setMode] = useState('ASSIGN');
  const [planId, setPlanId] = useState('');
  const [durationDays, setDurationDays] = useState(30);
  const [grantKind, setGrantKind] = useState('COMPLIMENTARY');
  const [paymentReference, setPaymentReference] = useState('');
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [validityDays, setValidityDays] = useState(7);
  const [featureKey, setFeatureKey] = useState('');
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [featureLimit, setFeatureLimit] = useState('');
  const [featureValue, setFeatureValue] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api
      .get('/admin/plans')
      .then((response) =>
        setPlans(response.data.filter((plan) => plan.status === 'ACTIVE' && plan.kind === 'PAID')),
      )
      .catch((failure) => setError(failure.message));
    api
      .get('/admin/access-control')
      .then((response) => setFeatures(response.data.features || []))
      .catch((failure) => setError(failure.message));
  }, []);
  async function run(task, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(message);
      await onChanged();
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const credentials = { reason, adminPassword };
  const selectedFeature = features.find((item) => item.key === featureKey);
  return (
    <UserDialog title="Manage subscription" onClose={onClose}>
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1 text-sm">
        <p className="text-muted">
          Plan changes take effect now and preserve remaining paid time. Each grant adds its
          duration to the current expiry.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Operation">
            <select
              className="field"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="ASSIGN">Assign paid plan</option>
              <option value="EXTEND">Extend current plan</option>
            </select>
          </Field>
          {mode === 'ASSIGN' ? (
            <Field label="Paid plan">
              <select
                className="field"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan._id} value={plan._id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Additional days">
              <input
                className="field"
                type="number"
                min="1"
                max="3650"
                value={durationDays}
                onChange={(event) => setDurationDays(Number(event.target.value))}
              />
            </Field>
          )}
          <Field label="Access source">
            <select
              className="field"
              value={grantKind}
              onChange={(event) => setGrantKind(event.target.value)}
            >
              <option value="COMPLIMENTARY">Complimentary</option>
              <option value="SUPPORT_COMPENSATION">Support compensation</option>
              <option value="PAYMENT_CONFIRMED">Externally confirmed payment</option>
            </select>
          </Field>
          {grantKind === 'PAYMENT_CONFIRMED' && (
            <Field label="Payment reference">
              <input
                className="field"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
            </Field>
          )}
        </div>
        <Field label="Reason">
          <textarea
            className="field"
            rows="2"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength="10"
          />
        </Field>
        <Field label="Confirm admin password">
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={
              busy || reason.length < 10 || !adminPassword || (mode === 'ASSIGN' && !planId)
            }
            onClick={async () => {
              const draft = {
                mode,
                planId: mode === 'ASSIGN' ? planId : undefined,
                durationDays: mode === 'EXTEND' ? durationDays : undefined,
                grantKind,
                paymentReference:
                  grantKind === 'PAYMENT_CONFIRMED' ? paymentReference : undefined,
                ...credentials,
              };
              const signature = JSON.stringify(draft);
              if (grantKey.current?.signature !== signature)
                grantKey.current = { signature, value: crypto.randomUUID() };
              const applied = await run(
                () => api.post(`/admin/users/${id}/grants`, {
                    ...draft,
                    idempotencyKey: grantKey.current.value,
                  }),
                'Access granted.',
              );
              if (applied) grantKey.current = null;
            }}
          >
            {busy ? 'Working…' : 'Apply access'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || !planId || reason.length < 10 || !adminPassword}
            onClick={() =>
              run(async () => {
                const result = await api.post(`/admin/users/${id}/renewal-link`, {
                  planId,
                  validityDays,
                  ...credentials,
                });
                setUrl(result.data.url);
              }, 'Renewal link generated.')
            }
          >
            Generate renewal link
          </button>
        </div>
        <Field label="Renewal link validity (days)">
          <input
            className="field max-w-32"
            type="number"
            min="1"
            max="365"
            value={validityDays}
            onChange={(event) => setValidityDays(Number(event.target.value))}
          />
        </Field>
        {url && (
          <div className="break-all rounded-lg border border-border p-3">
            {url}
            <button className="ml-2 underline" onClick={() => navigator.clipboard.writeText(url)}>
              Copy
            </button>
          </div>
        )}
        <Message error={error} success={notice} />
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 font-semibold">Individual feature override</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Feature">
              <select
                className="field"
                value={featureKey}
                onChange={(event) => setFeatureKey(event.target.value)}
              >
                <option value="">Select feature</option>
                {features
                  .filter(
                    (feature) => feature.status === 'ACTIVE' && feature.accessMode !== 'DISABLED',
                  )
                  .map((feature) => (
                    <option key={feature.key} value={feature.key}>
                      {feature.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Access">
              <select
                className="field"
                value={featureEnabled ? 'yes' : 'no'}
                onChange={(event) => setFeatureEnabled(event.target.value === 'yes')}
              >
                <option value="yes">Allowed</option>
                <option value="no">Blocked</option>
              </select>
            </Field>
            {selectedFeature?.type === 'LIMIT' && featureEnabled && (
              <Field label="Limit">
                <input
                  className="field"
                  type="number"
                  min="0"
                  value={featureLimit}
                  onChange={(event) => setFeatureLimit(event.target.value)}
                />
              </Field>
            )}
            {selectedFeature?.type === 'TEXT' && featureEnabled && (
              <Field label="Value">
                <input className="field" maxLength="240" value={featureValue} onChange={(event) => setFeatureValue(event.target.value)} />
              </Field>
            )}
          </div>
          <button
            className="btn-secondary mt-3"
            disabled={busy || !featureKey || reason.length < 10 || !adminPassword || (selectedFeature?.type === 'LIMIT' && featureEnabled && featureLimit === '') || (selectedFeature?.type === 'TEXT' && featureEnabled && !featureValue.trim())}
            onClick={() =>
              run(
                () =>
                  api.put(`/admin/users/${id}/overrides/${featureKey}`, {
                    ...credentials,
                    enabled: featureEnabled,
                    ...(selectedFeature?.type === 'LIMIT' && featureEnabled
                      ? { limit: Number(featureLimit) }
                      : {}),
                    ...(selectedFeature?.type === 'TEXT' && featureEnabled
                      ? { value: featureValue.trim() }
                      : {}),
                  }),
                'Feature override saved.',
              )
            }
          >
            Save override
          </button>
          <div className="mt-3 space-y-1">
            {management?.overrides?.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between border-b border-border py-2"
              >
                <span>
                  {item.key} · {item.enabled ? 'Allowed' : 'Blocked'}
                  {item.limit != null ? ` · limit ${item.limit}` : ''}
                </span>
                <button
                  className="text-red-700 underline"
                  disabled={busy || reason.length < 10 || !adminPassword}
                  onClick={() =>
                    run(
                      () =>
                        api.delete(`/admin/users/${id}/overrides/${item.key}`, {
                          data: credentials,
                        }),
                      'Override removed.',
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 font-semibold">Activation and grant history</h3>
          <div className="space-y-2">
            {data.history.length ? (
              data.history.map((row) => (
                <div
                  key={row._id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2"
                >
                  <div>
                    <b>{row.planSnapshot?.name || 'Plan'}</b> · {row.source}
                    {row.grantKind ? ` / ${row.grantKind}` : ''}
                    <div className="text-xs text-muted">
                      {when(row.activatedAt)} → {when(row.expiresAt)} · {row.status}
                    </div>
                  </div>
                  {row.source === 'ADMIN_GRANT' && row.status === 'ACTIVE' && (
                    <button
                      className="text-red-700 underline"
                      disabled={busy || reason.length < 10 || !adminPassword}
                      onClick={() =>
                        run(
                          () =>
                            api.post(`/admin/users/${id}/grants/${row._id}/revoke`, credentials),
                          'Grant revoked.',
                        )
                      }
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-muted">No access history.</p>
            )}
          </div>
        </section>
        <section className="border-t border-border pt-5">
          <h3 className="mb-3 font-semibold">Purchase history</h3>
          {data.purchases?.length ? (
            data.purchases.map((row) => (
              <p key={row._id} className="border-b border-border py-2 text-xs">
                {row.planSnapshot?.name || 'Plan'} · {row.state} · {row.amountMinor / 100}{' '}
                {row.currency} · {when(row.paidAt || row.createdAt)}
              </p>
            ))
          ) : (
            <p className="text-muted">No purchases.</p>
          )}
        </section>
      </div>
    </UserDialog>
  );
}
