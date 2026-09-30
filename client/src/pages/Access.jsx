import { Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/useAuth.js';
import { Spinner } from '../components/ui.jsx';

export default function Access() {
  const { loading, user, access, logout } = useAuth();
  const [key, setKey] = useState('');
  if (loading) return <Spinner label="Checking access…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (access?.eligible) return <Navigate to="/" replace />;
  const suspended = access?.reason === 'SUSPENDED';
  const expired = access?.reason === 'EXPIRED';
  const subscription = access?.subscription;
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="panel w-full max-w-lg p-8">
        <span className="text-xs font-bold uppercase tracking-widest text-primary">
          Orbit access
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold">
          {suspended
            ? 'Your account is suspended'
            : expired
              ? 'Your Orbit access has expired'
              : 'Activate your Orbit access'}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {suspended
            ? 'Contact an Orbit administrator for help. Suspension does not pause your access period.'
            : 'Your data is safe. Redeem a new Activation Link to continue using your workspace.'}
        </p>
        {subscription && (
          <div className="mt-6 rounded-xl border border-border bg-surface-alt p-4 text-sm">
            <p className="font-bold">{subscription.planSnapshot?.name || 'Access plan'}</p>
            <p className="mt-1 text-muted">
              {expired ? 'Expired' : 'Expires'} {new Date(subscription.expiresAt).toLocaleString()}
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
              placeholder="Paste Activation Link or key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button className="btn-primary">Redeem</button>
          </form>
        )}
        <div className="mt-7 flex items-center justify-between text-sm">
          <span>{user.fullName}</span>
          <button onClick={logout} className="text-primary underline">
            Log out
          </button>
        </div>
        <Link to="/login" className="sr-only">
          Login
        </Link>
      </div>
    </main>
  );
}
