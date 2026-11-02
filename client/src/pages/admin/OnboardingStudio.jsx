import { bilingual, moveItem, newId, newQuestion } from './onboarding/editorState.js';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { useAdminAuth } from '../../context/useAuth.js';
import { PageHeader, Spinner } from '../../components/ui.jsx';
import { DynamicOnboarding } from '../../components/onboarding/DynamicOnboarding.jsx';
import { QuestionField } from '../../components/onboarding/QuestionField.jsx';
import { DEFAULT_FLOW } from '../../../../shared/onboarding.js';
import {
  Field,
  LocalizedFields,
  MoveControls,
  QuestionEditor,
  Toggle,
} from './onboarding/EditorFields.jsx';
import Insights from './onboarding/Insights.jsx';

const definition = (flow) => ({ name: flow.name, pages: flow.pages, settings: flow.settings });
export default function OnboardingStudio() {
  const { admin } = useAdminAuth(),
    superAdmin = admin?.role === 'SUPER_ADMIN';
  const [params] = useSearchParams();
  const [flows, setFlows] = useState([]),
    [active, setActive] = useState(''),
    [draft, setDraft] = useState(null),
    [pageId, setPageId] = useState(''),
    [questionId, setQuestionId] = useState('');
  const [tab, setTab] = useState(
      params.get('tab') === 'insights' ? 'Insights & Statistics' : 'Builder',
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [dirty, setDirty] = useState(false);
  const [language, setLanguage] = useState('en'),
    [device, setDevice] = useState('mobile'),
    [previewRun, setPreviewRun] = useState(0);
  const [flowPage, setFlowPage] = useState(1),
    [hasMore, setHasMore] = useState(false);
  const locked = useRef(false);
  useEffect(() => {
    let live = true;
    api
      .get('/admin/onboarding/flows')
      .then((result) => {
        if (!live) return;
        setFlows(result.data.flows);
        setHasMore(Boolean(result.data.hasMore));
        setActive(result.data.activeFlow);
        const first =
          result.data.flows.find((f) => f.status === 'draft') ||
          result.data.flows.find((f) => f._id === result.data.activeFlow);
        setDraft(structuredClone(first || DEFAULT_FLOW));
        setPageId(first?.pages[0]?.id || 'welcome');
      })
      .catch((failure) => {
        if (live) setError(failure.message);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const page = draft?.pages.find((p) => p.id === pageId),
    question = page?.questions.find((q) => q.id === questionId);
  function edit(next) {
    setDraft(next);
    setDirty(true);
    setNotice('');
  }
  function editPage(next) {
    edit({ ...draft, pages: draft.pages.map((p) => (p.id === page.id ? next : p)) });
  }
  function addPage() {
    const next = {
      id: newId('page'),
      kind: 'questions',
      enabled: true,
      allowSkip: true,
      title: bilingual('New page', 'صفحة جديدة'),
      description: bilingual(),
      supportingText: bilingual(),
      emoji: '✨',
      questions: [],
    };
    edit({ ...draft, pages: [...draft.pages, next] });
    setPageId(next.id);
    setQuestionId('');
    setTab('Builder');
  }
  function addQuestion() {
    const q = newQuestion();
    editPage({ ...page, questions: [...page.questions, q] });
    setQuestionId(q.id);
    setTab('Question Editor');
  }
  function selectFlow(id) {
    if (dirty && !window.confirm('Discard unsaved changes and open another version?')) return;
    const next = flows.find((f) => f._id === id);
    if (!next) return;
    setDraft(structuredClone(next));
    setPageId(next.pages[0]?.id);
    setQuestionId('');
    setDirty(false);
    setNotice('');
    setError('');
  }
  async function loadOlderVersions() {
    setBusy(true);
    setError('');
    try {
      const result = (await api.get('/admin/onboarding/flows', { params: { page: flowPage + 1 } }))
        .data;
      setFlows((old) => [...old, ...result.flows.filter((f) => !old.some((v) => v._id === f._id))]);
      setFlowPage(result.page);
      setHasMore(result.hasMore);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveDraft() {
    const payload = definition(draft);
    const result =
      draft.status === 'draft'
        ? await api.patch(`/admin/onboarding/flows/${draft._id}`, {
            ...payload,
            revision: draft.revision,
          })
        : await api.post('/admin/onboarding/flows', payload);
    setDraft(result.data);
    setDirty(false);
    setFlows((old) => [result.data, ...old.filter((f) => f._id !== result.data._id)]);
    return result.data;
  }
  async function action(kind) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'save') {
        await saveDraft();
        setNotice('Draft saved. Publish when you are ready to show it to new users.');
      }
      if (kind === 'publish') {
        const saved = dirty || draft.status !== 'draft' ? await saveDraft() : draft;
        const result = await api.post(`/admin/onboarding/flows/${saved._id}/publish`, {
          revision: saved.revision,
        });
        const listing = (await api.get('/admin/onboarding/flows')).data;
        setFlows(listing.flows);
        setFlowPage(1);
        setHasMore(Boolean(listing.hasMore));
        setActive(listing.activeFlow);
        setDraft(listing.flows.find((f) => f._id === saved._id));
        setNotice(`Version ${result.data.version} is published and active for new sessions.`);
        setDirty(false);
      }
      if (kind === 'activate') {
        await api.post(`/admin/onboarding/flows/${draft._id}/activate`);
        setActive(draft._id);
        setNotice(`Version ${draft.version} is now active. Existing sessions keep their version.`);
      }
    } catch (failure) {
      const details = failure.errors
        ? Object.values(failure.errors)
            .flat()
            .filter((v) => typeof v === 'string')
            .join(' · ')
        : '';
      setError(`${failure.message}${details ? `: ${details}` : ''}`);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (!draft)
    return error ? (
      <div role="alert" className="panel p-5">
        {error}
        <button className="btn-secondary ms-3" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    ) : (
      <Spinner />
    );
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        eyebrow="Management"
        title="Onboarding"
        description="Create a focused welcome experience, collect answers, and see what people need."
        actions={
          superAdmin && (
            <>
              <button className="btn-secondary" disabled={busy} onClick={() => action('save')}>
                Save draft
              </button>
              <button className="btn-primary" disabled={busy} onClick={() => action('publish')}>
                {busy ? 'Saving…' : 'Publish'}
              </button>
            </>
          )
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
          {notice}
        </p>
      )}
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-0 flex-1">
          <span className="label">Flow version {dirty ? '· Unsaved changes' : ''}</span>
          <select
            className="field w-full"
            value={draft._id || ''}
            onChange={(e) => selectFlow(e.target.value)}
          >
            {!draft._id && <option value="">Unsaved draft</option>}
            {flows.map((f) => (
              <option key={f._id} value={f._id}>
                {f.status === 'draft' ? 'Draft' : `Published v${f.version}`} · {f.name}
                {f._id === active ? ' · Active' : ''}
              </option>
            ))}
          </select>
        </label>
        {hasMore && (
          <button className="btn-secondary" disabled={busy} onClick={loadOlderVersions}>
            Load older versions
          </button>
        )}
        {superAdmin && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => {
              if (dirty && !window.confirm('Discard unsaved changes?')) return;
              const copy = structuredClone(definition(draft));
              copy.name = `${copy.name.slice(0, 90)} copy`;
              setDraft(copy);
              setDirty(true);
              setNotice('New draft copy. Save it to add a separate flow.');
            }}
          >
            New draft from this version
          </button>
        )}
        {superAdmin && draft.status === 'published' && draft._id !== active && (
          <button
            className="btn-secondary"
            disabled={busy || dirty}
            onClick={() => action('activate')}
          >
            Make active
          </button>
        )}
      </div>
      <div
        role="tablist"
        aria-label="Onboarding studio"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {['Builder', 'Question Editor', 'Preview', 'Insights & Statistics'].map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls="onboarding-tab"
            id={`onboarding-tab-${name.split(' ')[0]}`}
            className={`min-h-12 whitespace-nowrap border-b-2 px-4 text-sm ${tab === name ? 'border-[#EB4300] font-semibold text-[#EB4300]' : 'border-transparent text-muted'}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <section
        id="onboarding-tab"
        role="tabpanel"
        aria-labelledby={`onboarding-tab-${tab.split(' ')[0]}`}
      >
        {tab === 'Insights & Statistics' ? (
          <Insights flows={flows} superAdmin={superAdmin} />
        ) : tab === 'Preview' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <label>
                <span className="label">Preview language</span>
                <select
                  className="field"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </label>
              <label>
                <span className="label">Device</span>
                <select
                  className="field"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                >
                  <option value="mobile">Mobile</option>
                  <option value="desktop">Desktop</option>
                </select>
              </label>
              <button className="btn-secondary mt-5" onClick={() => setPreviewRun((v) => v + 1)}>
                Restart preview
              </button>
              <p className="text-xs text-muted">
                Draft preview · Answers are never submitted. Telegram connection is simulated.
              </p>
            </div>
            <DynamicOnboarding
              key={`${language}-${device}-${previewRun}`}
              preview
              language={language}
              device={device}
              state={{ flow: draft }}
            />
          </div>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)] 2xl:grid-cols-[230px_minmax(0,1fr)_310px]">
            <aside className="panel space-y-3 p-4">
              <h2 className="font-semibold">Pages</h2>
              <fieldset disabled={!superAdmin || busy} className="space-y-3">
                {draft.pages.map((p, index) => (
                  <div
                    key={p.id}
                    draggable={superAdmin}
                    onDragStart={(e) => e.dataTransfer.setData('text/page', String(index))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('text/page');
                      if (raw !== '' && superAdmin)
                        edit({ ...draft, pages: moveItem(draft.pages, Number(raw), index) });
                    }}
                    className={`rounded-xl border p-3 ${p.id === pageId ? 'border-[#EB4300] bg-orange-50' : 'border-border'}`}
                  >
                    <button
                      type="button"
                      className="w-full text-start text-sm font-medium"
                      onClick={() => {
                        setPageId(p.id);
                        setQuestionId(p.questions[0]?.id || '');
                      }}
                    >
                      {p.emoji} {p.title.en || 'Untitled'}
                      <span className="mt-1 block text-xs font-normal text-muted">
                        {p.enabled ? 'Enabled' : 'Disabled'} · {p.questions.length} questions
                      </span>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <MoveControls
                        label={`page ${p.title.en}`}
                        index={index}
                        count={draft.pages.length}
                        onMove={(from, to) =>
                          edit({ ...draft, pages: moveItem(draft.pages, from, to) })
                        }
                      />
                      <input
                        type="checkbox"
                        aria-label={`Enable ${p.title.en}`}
                        checked={p.enabled}
                        onChange={(e) =>
                          edit({
                            ...draft,
                            pages: draft.pages.map((v) =>
                              v.id === p.id ? { ...v, enabled: e.target.checked } : v,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary w-full"
                  disabled={draft.pages.length >= 50}
                  onClick={addPage}
                >
                  Add page
                </button>
              </fieldset>
            </aside>
            <div className="panel min-w-0 space-y-5 p-5">
              {!superAdmin && (
                <p className="text-sm text-muted">
                  Super Admin access is required to edit and publish.
                </p>
              )}
              <fieldset disabled={!superAdmin || busy} className="min-w-0 space-y-5">
                <Field
                  label="Flow name"
                  maxLength={120}
                  value={draft.name}
                  onChange={(v) => edit({ ...draft, name: v })}
                />
                <details>
                  <summary className="cursor-pointer font-medium">Global settings</summary>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {[
                      ['enabled', 'Onboarding enabled'],
                      ['autoShow', 'Auto-show after registration'],
                      ['allowSkip', 'Allow skipping onboarding'],
                      ['showProgress', 'Show progress indicator'],
                    ].map(([key, label]) => (
                      <Toggle
                        key={key}
                        label={label}
                        checked={draft.settings[key]}
                        onChange={(value) =>
                          edit({ ...draft, settings: { ...draft.settings, [key]: value } })
                        }
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    These settings take effect when published. To switch versions, select a
                    published version above and choose Make active.
                  </p>
                </details>
                {page && (
                  <>
                    {tab === 'Builder' ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
                          <h2 className="font-semibold">Page editor</h2>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              className="text-sm text-primary underline"
                              disabled={draft.pages.length >= 50 || page.kind === 'telegram'}
                              onClick={() => {
                                const copy = structuredClone(page);
                                copy.id = newId('page');
                                copy.title.en = `${copy.title.en} copy`;
                                copy.questions = copy.questions.map((q) => ({
                                  ...q,
                                  id: newId('q'),
                                  options: q.options.map((o) => ({ ...o, value: newId('o') })),
                                  defaultValue: null,
                                }));
                                edit({ ...draft, pages: [...draft.pages, copy] });
                                setPageId(copy.id);
                              }}
                            >
                              Duplicate
                            </button>
                            <button
                              type="button"
                              className="text-sm text-red-700 underline"
                              disabled={draft.pages.length === 1}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete ${page.title.en} from this draft? Published versions and answers remain available.`,
                                  )
                                )
                                  return;
                                edit({
                                  ...draft,
                                  pages: draft.pages.filter((p) => p.id !== page.id),
                                });
                                setPageId(draft.pages.find((p) => p.id !== page.id)?.id);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
                          <Field
                            label="Page emoji"
                            maxLength={24}
                            value={page.emoji}
                            onChange={(v) => editPage({ ...page, emoji: v })}
                          />
                          <label>
                            <span className="label">Page type</span>
                            <select
                              className="field w-full"
                              value={page.kind}
                              onChange={(e) => {
                                if (
                                  page.questions.length &&
                                  e.target.value !== 'questions' &&
                                  !window.confirm(
                                    'Changing this page type removes its questions from the draft. Historical answers remain available.',
                                  )
                                )
                                  return;
                                editPage({
                                  ...page,
                                  kind: e.target.value,
                                  questions: e.target.value === 'questions' ? page.questions : [],
                                });
                              }}
                            >
                              {[
                                ['info', 'Information'],
                                ['questions', 'Data collection'],
                                ['welcome', 'Welcome template'],
                                ['features', 'Features template'],
                                ['telegram', 'Telegram connection'],
                              ].map(([value, label]) => (
                                <option
                                  key={value}
                                  value={value}
                                  disabled={
                                    value === 'telegram' &&
                                    draft.pages.some(
                                      (p) => p.kind === 'telegram' && p.id !== page.id,
                                    )
                                  }
                                >
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <LocalizedFields
                          label="Title"
                          value={page.title}
                          onChange={(v) => editPage({ ...page, title: v })}
                        />
                        <LocalizedFields
                          label="Description"
                          multiline
                          value={page.description}
                          onChange={(v) => editPage({ ...page, description: v })}
                        />
                        <LocalizedFields
                          label="Supporting text"
                          multiline
                          value={page.supportingText}
                          onChange={(v) => editPage({ ...page, supportingText: v })}
                        />
                        <Toggle
                          label="Allow skipping this page (including required questions)"
                          checked={page.allowSkip}
                          onChange={(v) => editPage({ ...page, allowSkip: v })}
                        />
                        {page.kind === 'telegram' && (
                          <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted">
                            This step uses Orbit’s existing Telegram connection and status. Its
                            position and visibility can be changed in the page list.
                          </p>
                        )}
                        {page.kind === 'questions' && (
                          <div className="space-y-3">
                            <h3 className="font-semibold">Questions</h3>
                            {page.questions.map((q, index) => (
                              <div
                                key={q.id}
                                className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-start text-sm"
                                  onClick={() => {
                                    setQuestionId(q.id);
                                    setTab('Question Editor');
                                  }}
                                >
                                  {q.emoji} {q.title.en}
                                  <span className="block text-xs text-muted">
                                    {q.type} · {q.required ? 'Required' : 'Optional'} ·{' '}
                                    {q.enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                </button>
                                <MoveControls
                                  label={`question ${q.title.en}`}
                                  index={index}
                                  count={page.questions.length}
                                  onMove={(from, to) =>
                                    editPage({
                                      ...page,
                                      questions: moveItem(page.questions, from, to),
                                    })
                                  }
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={page.questions.length >= 20}
                              onClick={addQuestion}
                            >
                              Add question
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                          <h2 className="font-semibold">Questions · {page.title.en}</h2>
                          {page.kind === 'questions' && (
                            <button
                              type="button"
                              className="btn-secondary"
                              disabled={page.questions.length >= 20}
                              onClick={addQuestion}
                            >
                              Add question
                            </button>
                          )}
                        </div>
                        {page.kind !== 'questions' ? (
                          <p className="text-sm text-muted">
                            Select a data-collection page or add a new page in Builder.
                          </p>
                        ) : (
                          <>
                            <div className="space-y-2">
                              {page.questions.map((q, index) => (
                                <div
                                  key={q.id}
                                  draggable
                                  onDragStart={(e) =>
                                    e.dataTransfer.setData('text/question', String(index))
                                  }
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    const raw = e.dataTransfer.getData('text/question');
                                    if (raw !== '')
                                      editPage({
                                        ...page,
                                        questions: moveItem(page.questions, Number(raw), index),
                                      });
                                  }}
                                  className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${questionId === q.id ? 'border-[#EB4300]' : 'border-border'}`}
                                >
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 p-2 text-start text-sm"
                                    onClick={() => setQuestionId(q.id)}
                                  >
                                    {q.emoji} {q.title.en}
                                  </button>
                                  <MoveControls
                                    label={`question ${q.title.en}`}
                                    index={index}
                                    count={page.questions.length}
                                    onMove={(from, to) =>
                                      editPage({
                                        ...page,
                                        questions: moveItem(page.questions, from, to),
                                      })
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="min-h-9 px-2 text-sm text-primary"
                                    aria-label={`Duplicate ${q.title.en}`}
                                    onClick={() => {
                                      const copy = { ...structuredClone(q), id: newId('q') };
                                      editPage({ ...page, questions: [...page.questions, copy] });
                                      setQuestionId(copy.id);
                                    }}
                                  >
                                    Copy
                                  </button>
                                  <button
                                    type="button"
                                    className="min-h-9 px-2 text-sm text-red-700"
                                    aria-label={`Delete ${q.title.en}`}
                                    onClick={() => {
                                      editPage({
                                        ...page,
                                        questions: page.questions.filter((v) => v.id !== q.id),
                                      });
                                      if (questionId === q.id) setQuestionId('');
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                            {question && (
                              <QuestionEditor
                                question={question}
                                onChange={(next) => {
                                  editPage({
                                    ...page,
                                    questions: page.questions.map((q) =>
                                      q.id === question.id ? next : q,
                                    ),
                                  });
                                  setQuestionId(next.id);
                                }}
                                onNotice={setNotice}
                              />
                            )}
                            {!question && (
                              <p className="text-sm text-muted">
                                Select a question above to edit it.
                              </p>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </fieldset>
            </div>
            <aside className="panel hidden space-y-5 p-5 2xl:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Current page preview
              </p>
              {page && (
                <div className="space-y-5">
                  <div className="text-center">
                    <span className="text-4xl">{page.emoji}</span>
                    <h3 className="mt-3 text-xl font-bold">{page.title.en}</h3>
                    <p className="mt-2 text-sm text-muted">{page.description.en}</p>
                  </div>
                  {page.questions
                    .filter((q) => q.enabled)
                    .map((q) => (
                      <QuestionField
                        key={q.id}
                        question={q}
                        disabled
                        value={q.defaultValue}
                        onChange={() => {}}
                      />
                    ))}
                  <p className="text-xs text-muted">
                    Open Preview to try the whole flow in English or Arabic.
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
