import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useTranslation } from 'react-i18next';

export default function AccountAction() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [action, setAction] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get(`/auth/account-action/${token}`)
      .then((response) => setAction(response.data))
      .catch((failure) => setError(failure.message));
  }, [token]);
  async function complete(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(
        `/auth/account-action/${token}`,
        action.kind === 'PASSWORD_RESET' ? { password } : {},
      );
      setDone(true);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-white p-7"
        onSubmit={complete}
      >
        <h1 className="font-display text-2xl font-semibold">
          {action?.kind === 'EMAIL_CHANGE'
            ? t('auth:accountAction.verifyEmail')
            : t('auth:accountAction.recoverAccount')}
        </h1>
        {done ? (
          <>
            <p>{t('auth:accountAction.updated')}</p>
            <Link className="btn-primary inline-flex" to="/login">
              {t('auth:signIn')}
            </Link>
          </>
        ) : (
          <>
            {action?.kind === 'EMAIL_CHANGE' && (
              <p>{t('auth:accountAction.confirmEmail', { email: action.newEmail })}</p>
            )}
            {action?.kind === 'PASSWORD_RESET' && (
              <label className="block text-sm">
                {t('auth:accountAction.newPassword')}
                <input
                  className="field mt-1"
                  type="password"
                  minLength="12"
                  maxLength="200"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              className="btn-primary"
              disabled={
                !action || busy || (action.kind === 'PASSWORD_RESET' && password.length < 12)
              }
            >
              {busy ? t('auth:accountAction.updating') : t('auth:accountAction.confirm')}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
