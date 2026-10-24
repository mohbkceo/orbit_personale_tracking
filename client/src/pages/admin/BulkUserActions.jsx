import { useState } from 'react';
import { api } from '../../api/client.js';
import { Field, Message, UserDialog } from './UserDialog.jsx';

const labels = {
  SUSPEND: 'Suspend selected users',
  UNSUSPEND: 'Unsuspend selected users',
  REVOKE_SESSIONS: 'Revoke all selected user sessions',
  DELETE: 'Permanently delete selected users',
};

export function BulkUserActions({ users, onClose, onApplied }) {
  const [action, setAction] = useState('SUSPEND');
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const ids = users.map((user) => user._id);
  async function apply() {
    setBusy(true);
    setError('');
    try {
      const response = await api.post('/admin/users/bulk', {
        ids,
        action,
        reason,
        adminPassword,
        ...(action === 'DELETE' ? { confirmation } : {}),
      });
      setResults(response.data.results);
      await onApplied();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <UserDialog title={`Bulk actions · ${users.length} users`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
        {results ? (
          <>
            <p role="status" className="font-semibold">Action completed for {results.filter((row) => row.deleted || row.changed).length} users.</p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {results.map((row) => (
                <p key={row.id} className="border-b border-border py-1">
                  {users.find((user) => user._id === row.id)?.email || row.id} ·{' '}
                  {row.error || (row.deleted || row.changed ? 'Completed' : 'Already in this state')}
                </p>
              ))}
            </div>
            <button className="btn-secondary" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="text-muted">Only the selected users on this page will be affected.</p>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
              {users.map((user) => <p key={user._id}>{user.fullName} · {user.email}</p>)}
            </div>
            <Field label="Action">
              <select className="field" value={action} onChange={(event) => { setAction(event.target.value); setConfirmation(''); setConfirmed(false); }}>
                {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {action === 'DELETE' && (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                Accounts and personal workspace data are permanently erased. Payment,
                subscription, activation and audit records remain. Users with unfinished
                payments will be skipped and reported individually.
              </p>
            )}
            <Field label="Reason">
              <textarea className="field" rows="2" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <Field label="Confirm admin password">
              <input className="field" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} />
            </Field>
            {action === 'DELETE' && (
              <Field label={`Type DELETE ${users.length} to confirm`}>
                <input className="field" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </Field>
            )}
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              <span>I confirm this action for {users.length} selected users.</span>
            </label>
            <button
              className={action === 'DELETE' ? 'rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50' : 'btn-primary'}
              disabled={busy || !confirmed || reason.trim().length < 10 || !adminPassword || (action === 'DELETE' && confirmation !== `DELETE ${users.length}`)}
              onClick={apply}
            >
              {busy ? 'Working…' : labels[action]}
            </button>
            <Message error={error} />
          </>
        )}
      </div>
    </UserDialog>
  );
}
