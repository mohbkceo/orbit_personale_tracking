import { useState } from 'react';
import { api } from '../../api/client.js';
import { Field, Message, UserDialog } from './UserDialog.jsx';

export function AccountDialog({ id, data, management, onClose, onChanged }) {
  const [action, setAction] = useState('PROFILE');
  const [fullName, setFullName] = useState(data.user.fullName);
  const [gender, setGender] = useState(data.user.gender || '');
  const [newEmail, setNewEmail] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [supportSessionId, setSupportSessionId] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const needsPassword = !['PROFILE', 'NOTE'].includes(action);
  const credential = { reason, adminPassword };
  const activeSessions = management?.sessions?.filter((row) => !row.revokedAt) || [];
  const activeSupportSessions =
    management?.supportSessions?.filter(
      (row) => !row.revokedAt && new Date(row.expiresAt) > new Date(),
    ) || [];
  async function submit() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'PROFILE')
        await api.patch(`/admin/users/${id}/profile`, { fullName, gender: gender || null, reason });
      if (action === 'EMAIL_CHANGE')
        await api.post(`/admin/users/${id}/account-action`, {
          kind: 'EMAIL_CHANGE',
          newEmail,
          ...credential,
        });
      if (action === 'PASSWORD_RESET')
        await api.post(`/admin/users/${id}/account-action`, {
          kind: 'PASSWORD_RESET',
          ...credential,
        });
      if (action === 'STATUS')
        await api.patch(`/admin/users/${id}/status`, {
          status: data.user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
          ...credential,
        });
      if (action === 'ONBOARDING')
        await api.post(`/admin/users/${id}/onboarding/reset`, credential);
      if (action === 'SESSION')
        await api.post(`/admin/users/${id}/sessions/revoke`, { sessionId, ...credential });
      if (action === 'ALL_SESSIONS')
        await api.post(`/admin/users/${id}/sessions/revoke`, { all: true, ...credential });
      if (action === 'SUPPORT_REVOKE')
        await api.post(
          `/admin/users/${id}/support-sessions/${supportSessionId}/revoke`,
          credential,
        );
      if (action === 'TELEGRAM')
        await api.post(`/admin/users/${id}/telegram/disconnect`, credential);
      if (action === 'NOTE') await api.post(`/admin/users/${id}/notes`, { text: note });
      setNotice(
        action === 'EMAIL_CHANGE' || action === 'PASSWORD_RESET'
          ? 'A one-time link was sent to the user.'
          : 'Account action completed.',
      );
      setAdminPassword('');
      setNote('');
      await onChanged();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <UserDialog title="Manage account" onClose={onClose}>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <Field label="Action">
          <select
            className="field"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setError('');
              setNotice('');
            }}
          >
            <option value="PROFILE">Edit profile</option>
            <option value="EMAIL_CHANGE">Request verified email change</option>
            <option value="PASSWORD_RESET">Send password recovery link</option>
            <option value="STATUS">
              {data.user.status === 'ACTIVE' ? 'Suspend account' : 'Unsuspend account'}
            </option>
            <option value="ONBOARDING">Reset onboarding</option>
            <option value="SESSION">Revoke selected session</option>
            <option value="ALL_SESSIONS">Revoke all sessions</option>
            <option value="SUPPORT_REVOKE">Terminate support session</option>
            <option value="TELEGRAM">Disconnect Telegram</option>
            <option value="NOTE">Add internal support note</option>
          </select>
        </Field>
        {action === 'PROFILE' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <input
                className="field"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </Field>
            <Field label="Gender">
              <select
                className="field"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
              >
                <option value="">Not set</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </Field>
          </div>
        )}
        {action === 'EMAIL_CHANGE' && (
          <Field label="New email (user must verify ownership)">
            <input
              className="field"
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </Field>
        )}
        {action === 'SESSION' && (
          <Field label="Session">
            <select
              className="field"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              <option value="">Select session</option>
              {activeSessions.map((row) => (
                <option key={row._id} value={row._id}>
                  {new Date(row.createdAt).toLocaleString()} · {row.userAgent || 'Browser'}
                </option>
              ))}
            </select>
          </Field>
        )}
        {action === 'SUPPORT_REVOKE' && (
          <Field label="Support session">
            <select
              className="field"
              value={supportSessionId}
              onChange={(event) => setSupportSessionId(event.target.value)}
            >
              <option value="">Select session</option>
              {activeSupportSessions.map((row) => (
                <option key={row._id} value={row._id}>
                  {new Date(row.createdAt).toLocaleString()} · read-only
                </option>
              ))}
            </select>
          </Field>
        )}
        {action === 'NOTE' ? (
          <Field label="Internal note">
            <textarea
              className="field"
              rows="3"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Reason">
            <textarea
              className="field"
              rows="2"
              minLength="10"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        )}
        {needsPassword && (
          <Field label="Confirm admin password">
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
          </Field>
        )}
        {['STATUS', 'ALL_SESSIONS', 'TELEGRAM', 'ONBOARDING'].includes(action) && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
            This action affects the user immediately.
          </p>
        )}
        <button
          className="btn-primary"
          disabled={
            busy ||
            (action === 'NOTE' ? !note.trim() : reason.length < 10) ||
            (needsPassword && !adminPassword) ||
            (action === 'SESSION' && !sessionId) ||
            (action === 'SUPPORT_REVOKE' && !supportSessionId) ||
            (action === 'EMAIL_CHANGE' && !newEmail)
          }
          onClick={submit}
        >
          {busy ? 'Working…' : 'Confirm action'}
        </button>
        <Message error={error} success={notice} />
        <section className="border-t border-border pt-4">
          <h3 className="font-semibold">Internal support notes</h3>
          <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {management?.notes?.length ? (
              management.notes.map((row) => (
                <p
                  key={row._id}
                  className="whitespace-pre-wrap border-b border-border pb-2 text-xs"
                >
                  {row.text} · {new Date(row.createdAt).toLocaleString()}
                </p>
              ))
            ) : (
              <p className="text-muted">No notes yet.</p>
            )}
          </div>
        </section>
        <section className="border-t border-border pt-4">
          <h3 className="font-semibold">Account action history</h3>
          <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {management?.events?.length ? (
              management.events.map((row) => (
                <p key={row._id} className="border-b border-border pb-2 text-xs">
                  {row.event} · {new Date(row.createdAt).toLocaleString()}
                </p>
              ))
            ) : (
              <p className="text-muted">No account actions yet.</p>
            )}
          </div>
        </section>
      </div>
    </UserDialog>
  );
}
