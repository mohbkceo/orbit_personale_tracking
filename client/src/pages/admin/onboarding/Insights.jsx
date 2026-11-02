import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { Spinner } from '../../../components/ui.jsx';
import { localized, emptyAnswer } from '../../../../../shared/onboarding.js';

function displayAnswer(question, value) {
  if (emptyAnswer(value)) return '—';
  return (Array.isArray(value) ? value : [value])
    .map((v) => localized(question?.options?.find((o) => o.value === v)?.label) || String(v))
    .join(', ');
}
export function AnswerList({ row }) {
  const questions = row.definition?.[0]?.pages?.flatMap((p) => p.questions) || [];
  return (
    <dl className="space-y-3">
      {Object.entries(row.answers || {}).map(([id, value]) => (
        <div key={id}>
          <dt className="text-sm font-medium">
            {localized(questions.find((q) => q.id === id)?.title) || id}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">
            {displayAnswer(
              questions.find((q) => q.id === id),
              value,
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function Insights({ flows, superAdmin, userId }) {
  const [filters, setFilters] = useState({}),
    [applied, setApplied] = useState({}),
    [data, setData] = useState(null),
    [responses, setResponses] = useState(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setBusy(true);
    try {
      const params = { ...applied, ...(userId ? { user: userId } : {}) };
      const results = await Promise.all([
        api.get('/admin/onboarding/insights', { params }),
        api.get('/admin/onboarding/responses', { params: { ...params, page } }),
      ]);
      if (currentRequest !== requestId.current) return;
      setData(results[0].data);
      setResponses(results[1].data);
      setError('');
    } catch (failure) {
      if (currentRequest === requestId.current) setError(failure.message);
    } finally {
      if (currentRequest === requestId.current) setBusy(false);
    }
  }, [applied, page, userId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const published = flows.filter((f) => f.status === 'published'),
    questions = published
      .filter((f) => !filters.flow || f._id === filters.flow)
      .flatMap((f) =>
        f.pages.flatMap((p) => p.questions.map((q) => ({ ...q, flow: f._id, version: f.version }))),
      );
  const selected = questions.find((q) => q.id === filters.question);
  function filter(key, value) {
    setFilters((old) => ({
      ...old,
      [key]: value,
      ...(key === 'flow' ? { question: '', answer: '' } : key === 'question' ? { answer: '' } : {}),
    }));
  }
  async function exportCsv() {
    setBusy(true);
    try {
      const result = await api.get('/admin/onboarding/export', {
        params: { ...applied, ...(userId ? { user: userId } : {}) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(result),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'orbit-onboarding.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {!userId && (
        <form
          className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')));
            setPage(1);
          }}
        >
          <label>
            <span className="label">From (UTC)</span>
            <input
              className="field w-full"
              type="date"
              value={filters.from || ''}
              onChange={(e) => filter('from', e.target.value)}
            />
          </label>
          <label>
            <span className="label">Through (UTC)</span>
            <input
              className="field w-full"
              type="date"
              value={filters.to || ''}
              onChange={(e) => filter('to', e.target.value)}
            />
          </label>
          <label>
            <span className="label">Published version</span>
            <select
              className="field w-full"
              value={filters.flow || ''}
              onChange={(e) => filter('flow', e.target.value)}
            >
              <option value="">All versions</option>
              {published.map((f) => (
                <option key={f._id} value={f._id}>
                  v{f.version} · {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Subscription at start</span>
            <select
              className="field w-full"
              value={filters.plan || ''}
              onChange={(e) => filter('plan', e.target.value)}
            >
              <option value="">All plans</option>
              {data?.plans.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Completion status</span>
            <select
              className="field w-full"
              value={filters.status || ''}
              onChange={(e) => filter('status', e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="partial">Partial</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
          <label>
            <span className="label">Question</span>
            <select
              className="field w-full"
              value={filters.question || ''}
              onChange={(e) => {
                const question = questions.find((q) => q.id === e.target.value);
                setFilters((old) => ({
                  ...old,
                  question: e.target.value,
                  flow: question?.flow || old.flow || '',
                  answer: '',
                }));
              }}
            >
              <option value="">All questions</option>
              {questions.map((q) => (
                <option key={`${q.flow}-${q.id}`} value={q.id}>
                  v{q.version} · {q.title.en}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Selected answer / exact value</span>
            {selected?.options?.length || selected?.type === 'yes-no' ? (
              <select
                className="field w-full"
                value={filters.answer || ''}
                onChange={(e) => filter('answer', e.target.value)}
              >
                <option value="">Any answer</option>
                {(selected.type === 'yes-no'
                  ? [
                      { value: 'true', label: { en: 'Yes' } },
                      { value: 'false', label: { en: 'No' } },
                    ]
                  : selected.options
                ).map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.emoji} {o.label.en}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field w-full"
                disabled={!selected}
                value={filters.answer || ''}
                onChange={(e) => filter('answer', e.target.value)}
              />
            )}
          </label>
          <div className="flex items-end gap-2">
            <button className="btn-primary" disabled={busy}>
              Apply filters
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFilters({});
                setApplied({});
                setPage(1);
              }}
            >
              Reset
            </button>
          </div>
        </form>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy} onClick={refresh}>
          Refresh
        </button>
        {superAdmin && (
          <button className="btn-secondary" disabled={busy} onClick={exportCsv}>
            Export filtered CSV
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {!data ? (
        <Spinner />
      ) : (
        <>
          {!userId && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  ['Started', data.kpis.started],
                  ['Completed', data.kpis.completed],
                  ['Skipped', data.kpis.skipped],
                  ['Partial', data.kpis.partial],
                  ['Completion rate', `${data.kpis.completionRate.toFixed(1)}%`],
                  [
                    'Average completion',
                    data.kpis.averageCompletionSeconds == null
                      ? '—'
                      : `${Math.round(data.kpis.averageCompletionSeconds)} sec`,
                  ],
                  ['Submitted answers', data.kpis.totalSubmittedResponses],
                ].map(([label, value]) => (
                  <div key={label} className="panel p-4">
                    <p className="text-xs text-muted">{label}</p>
                    <strong className="mt-2 block text-2xl">{value}</strong>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted">
                Each user counts once in this filtered cohort. Completion rate uses all started
                users. Duration is elapsed time from start to completion, including time away.
                Choice percentages use respondents who answered; multiple choice may total above
                100%. Versions remain separate. Older tour activity without a response record is
                excluded.
              </p>
              <section className="panel p-4">
                <h2 className="mb-3 font-semibold">Most skipped pages</h2>
                {data.pages
                  .filter((p) => p.skipped)
                  .slice(0, 10)
                  .map((p) => (
                    <p key={`${p.flow}-${p.id}`} className="border-b border-border py-2 text-sm">
                      v{p.version} · {p.title.en} · {p.skipped} skipped / {p.seen} saw
                    </p>
                  ))}
                {!data.pages.some((p) => p.skipped) && (
                  <p className="text-sm text-muted">No skipped pages in this cohort.</p>
                )}
              </section>
              <section className="panel p-4">
                <h2 className="mb-3 font-semibold">Most skipped questions</h2>
                {[...data.questions]
                  .sort((a, b) => b.skipped - a.skipped)
                  .filter((q) => q.skipped)
                  .slice(0, 10)
                  .map((q) => (
                    <p key={`${q.flow}-${q.id}`} className="py-1 text-sm">
                      v{q.version} · {q.title.en} · {q.skipped} skipped / {q.seen} saw
                    </p>
                  ))}
                {!data.questions.some((q) => q.skipped) && (
                  <p className="text-sm text-muted">No skipped questions in this cohort.</p>
                )}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.questions
                  .filter((q) => !applied.question || q.id === applied.question)
                  .map((q) => (
                    <section key={`${q.flow}-${q.id}`} className="panel min-w-0 p-5">
                      <p className="text-xs text-muted">
                        v{q.version} · {q.type}
                      </p>
                      <h2 className="mt-1 font-semibold">{q.title.en}</h2>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        Saw {q.seen} · Answered {q.answered} · Skipped {q.skipped} · Pending{' '}
                        {q.unanswered} · Never reached {q.neverReached}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Answers from completed: {q.completedAnswers} · partial: {q.partialAnswers} ·
                        skipped submissions: {q.skippedSubmissionAnswers}
                      </p>
                      {q.average != null && (
                        <dl className="my-4 grid grid-cols-2 gap-2 text-sm">
                          {['average', 'median', 'min', 'max'].map((key) => (
                            <div key={key}>
                              <dt className="capitalize text-muted">{key}</dt>
                              <dd>{Number(q[key].toFixed(2))}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {q.distribution?.map((bucket, i) => (
                        <div key={i} className="mt-3">
                          <div className="flex justify-between gap-2 text-xs">
                            <span>
                              {bucket.emoji}{' '}
                              {typeof bucket.label === 'string'
                                ? bucket.label
                                : localized(bucket.label)}
                            </span>
                            <span>
                              {bucket.count}
                              {bucket.percentage != null
                                ? ` · ${bucket.percentage.toFixed(1)}%`
                                : ''}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#EB4300]"
                              style={{
                                width: `${q.answered ? (bucket.count / q.answered) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {['text', 'long-text'].includes(q.type) && (
                        <button
                          className="mt-4 text-sm text-primary underline"
                          onClick={() => {
                            const next = { ...applied, flow: q.flow, question: q.id };
                            setApplied(next);
                            setFilters(next);
                            setPage(1);
                          }}
                        >
                          Inspect individual text answers below
                        </button>
                      )}
                    </section>
                  ))}
              </div>
            </>
          )}
          <section className="panel p-5">
            <h2 className="mb-4 font-semibold">Individual submissions ({responses?.total || 0})</h2>
            <div className="space-y-3">
              {responses?.rows.map((row) => (
                <details key={row._id} className="rounded-xl border border-border p-4">
                  <summary className="cursor-pointer text-sm">
                    <b>{row.identity?.[0]?.fullName || 'User'}</b> · v{row.version} · {row.status} ·{' '}
                    {row.plan}
                    <span className="mt-1 block text-xs text-muted">
                      Started {new Date(row.startedAt).toLocaleString()} · Completed{' '}
                      {row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'}
                    </span>
                  </summary>
                  <div className="mt-4">
                    <AnswerList row={row} />
                    {!Object.keys(row.answers || {}).length && (
                      <p className="text-sm text-muted">No submitted answers.</p>
                    )}
                    <Link
                      className="mt-3 inline-block text-sm text-primary underline"
                      to={`/admin/users/${row.user}`}
                    >
                      User details
                    </Link>
                  </div>
                </details>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                className="btn-secondary"
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="text-sm">
                Page {page} of {Math.max(1, Math.ceil((responses?.total || 0) / 20))}
              </span>
              <button
                className="btn-secondary"
                disabled={busy || page * 20 >= (responses?.total || 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
