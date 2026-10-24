import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Spinner } from '../../components/ui.jsx';

const sections = [
  'dashboard',
  'tasks',
  'reminders',
  'accounts',
  'transactions',
  'expenses',
  'income',
  'debts',
  'bills',
  'subscriptions',
  'goals',
  'projects',
  'habits',
  'wishlist',
  'contacts',
  'notes',
  'events',
  'settings',
];
const title = (key) => key[0].toUpperCase() + key.slice(1);
const display = (row) =>
  row.title ||
  row.name ||
  row.personName ||
  row.event?.title ||
  row.description ||
  row.type ||
  'Record';

export default function SupportWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const section = sections.includes(params.get('section')) ? params.get('section') : 'dashboard';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [session, setSession] = useState(null);
  const [resource, setResource] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const load = useCallback(async () => {
    setError('');
    setResource(null);
    try {
      const verified = await api.get('/admin/support/session');
      if (verified.data.user.id !== id)
        throw new Error('This support session belongs to another user.');
      setSession(verified.data);
      const result = await api.get(`/admin/support/workspace/${section}`, { params: { page } });
      setResource(result.data.data);
      setPagination(result.data.pagination || null);
      setExpired(false);
    } catch (failure) {
      setError(failure.message);
      if (failure.status === 401 || failure.code === 'SUPPORT_TARGET_MISMATCH' || /another user/i.test(failure.message))
        setExpired(true);
    }
  }, [id, section, page]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (session?.expiresAt && new Date(session.expiresAt).getTime() <= now) setExpired(true);
  }, [session, now]);
  async function exit() {
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/support/exit');
      navigate(`/admin/users/${id}`, { replace: true });
    } catch (failure) {
      if (failure.status === 401) navigate(`/admin/users/${id}`, { replace: true });
      else setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const seconds = session?.expiresAt
    ? Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now) / 1000))
    : 0;
  return (
    <div className="min-h-screen bg-canvas text-text">
      <header className="sticky top-0 z-40 border-b-2 border-primary bg-white px-4 py-3 shadow-xs sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-primary">
              Admin Support Mode · Viewing {session?.user?.fullName || 'user'} · Read-only
            </p>
            <p className="text-xs text-muted">
              {session?.user?.email || 'Session verification required'} ·{' '}
              {expired
                ? 'Session expired'
                : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`}
            </p>
          </div>
          <button className="btn-primary" onClick={exit} disabled={busy}>
            {busy ? 'Exiting…' : 'Exit to Admin'}
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <nav
          aria-label="Support workspace sections"
          className="mb-6 flex gap-2 overflow-x-auto pb-2"
        >
          {sections.map((item) => (
            <Link
              key={item}
              to={`?section=${item}`}
              onClick={(event) => {
                if (expired) event.preventDefault();
              }}
              className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm ${section === item ? 'border-primary bg-primary text-white' : 'border-border bg-white text-text'}`}
            >
              {title(item)}
            </Link>
          ))}
        </nav>
        {expired ? (
          <section className="rounded-xl border border-border bg-white p-6">
            <h1 className="font-display text-xl font-semibold">Support access ended</h1>
            <p className="mt-2 text-sm text-muted">
              This session has expired, was revoked, or is for another user. Return to the user
              profile to start a new session.
            </p>
            <Link className="btn-secondary mt-4 inline-flex" to={`/admin/users/${id}`}>
              Return to Admin
            </Link>
          </section>
        ) : error ? (
          <section className="rounded-xl border border-red-200 bg-white p-6">
            <p role="alert">{error}</p>
            <button className="btn-secondary mt-3" onClick={load}>
              Retry
            </button>
          </section>
        ) : resource === null ? (
          <Spinner />
        ) : (
          <section className="rounded-xl border border-border bg-white p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-4">
              <h1 className="font-display text-2xl font-semibold">{title(section)}</h1>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                Read-only · actual user data
              </span>
            </div>
            {section === 'dashboard' && (
              <>
                <p className="mb-4 text-sm text-muted">
                  Current plan: {resource.plan?.name || 'Free'}
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(resource.counts || {}).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border p-4">
                      <p className="text-xs text-muted">{title(key)}</p>
                      <p className="mt-1 font-display text-xl font-semibold">
                        {value === null ? 'Not available on plan' : value}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {section === 'settings' && (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {Object.entries(resource.setting || {})
                  .filter(([key]) => !key.startsWith('_'))
                  .map(([key, value]) => (
                    <p key={key} className="border-b border-border pb-2">
                      <span className="text-muted">{title(key)}: </span>
                      {String(value ?? '—')}
                    </p>
                  ))}
                <p className="border-b border-border pb-2">
                  <span className="text-muted">Telegram: </span>
                  {resource.telegram?.username ? `@${resource.telegram.username}` : 'Not connected'}
                </p>
              </div>
            )}
            {Array.isArray(resource) && (
              <>
                {resource.length ? (
                  <div className="divide-y divide-border">
                    {resource.map((row) => (
                      <article key={row._id} className="py-4 text-sm">
                        <h2 className="font-semibold">{display(row)}</h2>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          {Object.entries(row)
                            .filter(
                              ([key, value]) =>
                                ![
                                  '_id',
                                  'user',
                                  '__v',
                                  'title',
                                  'name',
                                  'description',
                                  'content',
                                ].includes(key) &&
                                value != null &&
                                typeof value !== 'object',
                            )
                            .slice(0, 8)
                            .map(([key, value]) => (
                              <span key={key}>
                                {key}: {String(value)}
                              </span>
                            ))}
                        </div>
                        {section === 'notes' && (
                          <p className="mt-2 whitespace-pre-wrap text-sm">{row.content}</p>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No records in this section.</p>
                )}
                {pagination?.pages > 1 && (
                  <div className="mt-5 flex items-center gap-3 text-sm">
                    <Link
                      aria-disabled={page <= 1}
                      className="btn-secondary"
                      to={`?section=${section}&page=${Math.max(1, page - 1)}`}
                    >
                      Previous
                    </Link>
                    <span>
                      Page {page} of {pagination.pages}
                    </span>
                    <Link
                      aria-disabled={page >= pagination.pages}
                      className="btn-secondary"
                      to={`?section=${section}&page=${Math.min(pagination.pages, page + 1)}`}
                    >
                      Next
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
