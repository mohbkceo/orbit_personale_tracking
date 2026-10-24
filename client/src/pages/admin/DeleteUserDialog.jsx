import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Field, Message, UserDialog } from './UserDialog.jsx';

export function DeleteUserDialog({ user, onClose }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await api.delete(`/admin/users/${user.id}`, {
        data: { confirmationEmail: email.trim(), reason, adminPassword },
      });
      navigate('/admin/users', { replace: true });
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }
  return (
    <UserDialog title={`Delete ${user.fullName}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          This permanently erases this account and its personal workspace data. Payment,
          subscription, activation and audit records remain. Unfinished payments must be resolved
          first. This cannot be undone.
        </p>
        <Field label={`Type ${user.email} to confirm`}>
          <input
            className="field"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Reason">
          <textarea
            className="field"
            rows="2"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
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
        <button
          className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
          disabled={
            busy ||
            email.trim().toLowerCase() !== user.email.toLowerCase() ||
            reason.trim().length < 10 ||
            !adminPassword
          }
          onClick={remove}
        >
          {busy ? 'Deleting…' : 'Permanently delete user'}
        </button>
        <Message error={error} />
      </div>
    </UserDialog>
  );
}
