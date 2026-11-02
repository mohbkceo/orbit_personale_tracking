import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_FLOW,
  answerError,
  enabledPages,
  localized,
} from '../../../../shared/onboarding.js';
import { useTelegram } from '../../context/TelegramContext.js';
import { QuestionField } from './QuestionField.jsx';
import { OnboardingTemplate } from './OnboardingTemplates.jsx';

function readLocal(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}
function writeLocal(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* In-memory editing remains available when storage is disabled. */
  }
}

export function DynamicOnboarding({
  state,
  update,
  submit,
  onExit,
  preview = false,
  language: previewLanguage,
  device = 'mobile',
}) {
  const { t, i18n } = useTranslation();
  const context = useTelegram();
  const language = previewLanguage || (i18n.resolvedLanguage === 'ar' ? 'ar' : 'en'),
    ar = language === 'ar';
  const tr = useCallback((key) => t(`onboarding:studio.${key}`, { lng: language }), [t, language]);
  const flow = state.flow || DEFAULT_FLOW,
    pages = enabledPages(flow);
  const [pageId, setPageId] = useState(() =>
    pages.some((p) => p.id === state.step) ? state.step : pages[0]?.id,
  );
  const storageKey = `orbit:onboarding:${state.userId}:${flow._id}:${state.attempt || 'initial'}`;
  const [answers, setAnswers] = useState(() => ({
    ...(state.answers || {}),
    ...(!preview && state.userId ? readLocal(storageKey) : {}),
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState({}),
    [finished, setFinished] = useState(false);
  const revision = useRef(state.revision || 0),
    locked = useRef(false),
    headingRef = useRef(null),
    initialized = useRef(false);
  const answerRef = useRef(answers),
    dirty = useRef(false),
    autosave = useRef(null);
  const initializedDefaults = useRef(new Set());
  const page = pages.find((p) => p.id === pageId),
    index = pages.indexOf(page);
  const telegram = preview
    ? { status: { connected: false, botUrl: '#' }, connect: () => {}, loading: false }
    : context || {};
  const watch = context?.setWatching;
  useEffect(() => {
    if (!preview && page?.kind === 'telegram') watch?.(true);
    return () => {
      if (!preview) watch?.(false);
    };
  }, [page?.kind, watch, preview]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [pageId]);

  const act = useCallback(
    async (action, { quiet = false } = {}) => {
      if (locked.current || !page) return;
      const currentAnswers = answerRef.current;
      const fieldErrors = {};
      if (['next', 'complete'].includes(action))
        for (const q of page.questions.filter((q) => q.enabled)) {
          if (answerError(q, currentAnswers[q.id], true)) fieldErrors[q.id] = tr('invalidAnswer');
        }
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length) return;
      clearTimeout(autosave.current);
      locked.current = true;
      setBusy(true);
      if (!quiet) setError('');
      try {
        const nextIndex = action === 'back' ? Math.max(index - 1, 0) : index + 1;
        const terminal =
          action === 'skip' ||
          action === 'complete' ||
          (['next', 'skip-page'].includes(action) && nextIndex >= pages.length);
        let saved;
        if (!preview && submit) {
          const pageAnswers = Object.fromEntries(
            page.questions
              .filter(
                (q) =>
                  q.enabled &&
                  (!['skip', 'skip-page'].includes(action) ||
                    !answerError(q, currentAnswers[q.id], false)),
              )
              .map((q) => [q.id, currentAnswers[q.id] ?? null]),
          );
          saved = await submit({
            flowId: flow._id,
            revision: revision.current,
            pageId: page.id,
            action,
            answers: pageAnswers,
            ...(state.status === 'SKIPPED' ? { resume: true } : {}),
          });
          revision.current = saved.revision;
        } else if (!preview && update && !['start', 'save'].includes(action)) {
          await update(
            terminal ? (action === 'skip' ? 'SKIPPED' : 'COMPLETED') : 'IN_PROGRESS',
            terminal ? undefined : pages[nextIndex].id,
            state.status === 'SKIPPED' && !terminal,
          );
        }
        dirty.current = false;
        if (!preview && state.userId) writeLocal(storageKey, {});
        if (terminal) {
          setFinished(true);
          if (!preview) onExit?.();
        } else if (['next', 'skip-page', 'back'].includes(action))
          setPageId(
            saved?.status === 'COMPLETED'
              ? pages[nextIndex].id
              : saved?.step || pages[nextIndex].id,
          );
        if (quiet) setError('');
      } catch (failure) {
        setError(failure.message || tr('saveError'));
        if (failure.errors)
          setErrors(
            Object.fromEntries(Object.keys(failure.errors).map((id) => [id, tr('checkAnswer')])),
          );
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [
      page,
      tr,
      index,
      pages,
      preview,
      submit,
      update,
      flow._id,
      state.status,
      state.userId,
      storageKey,
      onExit,
    ],
  );
  const actRef = useRef(act);
  actRef.current = act;
  useEffect(() => {
    if (initialized.current === pageId || preview || !submit) return;
    initialized.current = pageId;
    void actRef.current('start');
  }, [preview, submit, pageId]);
  useEffect(() => {
    if (!page || initializedDefaults.current.has(page.id)) return;
    initializedDefaults.current.add(page.id);
    const defaults = Object.fromEntries(
      page.questions
        .filter((q) => q.enabled && q.defaultValue != null && answerRef.current[q.id] == null)
        .map((q) => [q.id, q.defaultValue]),
    );
    if (Object.keys(defaults).length) {
      answerRef.current = { ...answerRef.current, ...defaults };
      setAnswers(answerRef.current);
    }
  }, [page]);
  useEffect(() => () => clearTimeout(autosave.current), []);
  function change(id, value) {
    const next = { ...answerRef.current, [id]: value };
    answerRef.current = next;
    setAnswers(next);
    dirty.current = true;
    setErrors((old) => ({ ...old, [id]: '' }));
    if (!preview && state.userId) writeLocal(storageKey, next);
    clearTimeout(autosave.current);
    if (!preview && submit)
      autosave.current = setTimeout(() => {
        if (dirty.current) void actRef.current('save', { quiet: true });
      }, 1000);
  }
  if (!page) return <p role="alert">{tr('noPages')}</p>;
  if (finished)
    return (
      <div dir={ar ? 'rtl' : 'ltr'} className="panel p-8 text-center">
        <p>{tr('previewFinished')}</p>
        <button
          className="btn-primary mt-4"
          onClick={() => {
            setFinished(false);
            setPageId(pages[0].id);
          }}
        >
          {' '}
          {tr('restartPreview')}
        </button>
      </div>
    );
  return (
    <main
      dir={ar ? 'rtl' : 'ltr'}
      className={
        preview
          ? 'rounded-3xl bg-slate-50 p-3'
          : 'grid min-h-dvh bg-[#F3F5F9] text-[#18191D] sm:place-items-center sm:p-6'
      }
    >
      <div
        className={`mx-auto flex w-full flex-col bg-white ${preview ? (device === 'mobile' ? 'min-h-[640px] max-w-[420px] rounded-3xl border border-border' : 'min-h-[600px] max-w-4xl rounded-3xl border border-border') : 'min-h-dvh sm:min-h-[700px] sm:max-w-[480px] sm:rounded-[32px] sm:border sm:border-border'}`}
      >
        <header className="flex min-h-20 items-center gap-4 px-6">
          <div className="w-12">
            {index > 0 && (
              <button
                type="button"
                aria-label={tr('back')}
                className="min-h-11 min-w-11 rounded-full focus-visible:ring-2 focus-visible:ring-[#EB4300]"
                disabled={busy}
                onClick={() => act('back')}
              >
                {ar ? '→' : '←'}
              </button>
            )}
          </div>
          {flow.settings.showProgress && (
            <div
              className="flex-1"
              role="progressbar"
              aria-label={tr('progress')}
              aria-valuemin={1}
              aria-valuemax={pages.length}
              aria-valuenow={index + 1}
            >
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#EB4300]"
                  style={{ width: `${((index + 1) / pages.length) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs text-muted">
                {index + 1} / {pages.length}
              </p>
            </div>
          )}
          <div className="w-12" />
        </header>
        <section className="flex-1 space-y-6 px-6 py-5 sm:px-8">
          {['welcome', 'features', 'telegram'].includes(page.kind) ? (
            <OnboardingTemplate
              page={page}
              t={t}
              language={language}
              headingRef={headingRef}
              telegram={telegram}
              busy={busy}
            />
          ) : (
            <>
              <div className="text-center">
                <span className="text-5xl" aria-hidden="true">
                  {page.emoji}
                </span>
                <h1 ref={headingRef} tabIndex={-1} className="mt-4 text-3xl font-bold outline-none">
                  {localized(page.title, language)}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {localized(page.description, language)}
                </p>
              </div>
              {page.questions
                .filter((q) => q.enabled)
                .map((q) => (
                  <QuestionField
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => change(q.id, v)}
                    language={language}
                    error={errors[q.id]}
                    disabled={busy}
                  />
                ))}
            </>
          )}
          {localized(page.supportingText, language) && (
            <p className="text-center text-sm text-muted">
              {localized(page.supportingText, language)}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 underline"
                disabled={busy}
                onClick={() => act('save')}
              >
                {tr('retrySave')}
              </button>
            </div>
          )}
        </section>
        <footer className="space-y-2 border-t border-border px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            disabled={busy || telegram.busy}
            onClick={() => act('next')}
            className="min-h-[54px] w-full rounded-full bg-[#EB4300] px-6 font-semibold text-white focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {tr(busy ? 'saving' : 'next')}
          </button>
          {page.allowSkip && page.questions.some((q) => q.enabled) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act('skip-page')}
              className="min-h-11 w-full rounded-full text-sm text-muted"
            >
              {tr('skipPage')}
            </button>
          )}
          {flow.settings.allowSkip && (
            <button
              type="button"
              disabled={busy || telegram.busy}
              onClick={() => act('skip')}
              className="min-h-[49px] w-full rounded-full bg-slate-100 px-6 text-sm text-slate-600 focus-visible:ring-2 focus-visible:ring-[#EB4300] disabled:opacity-50"
            >
              {tr('skip')}
            </button>
          )}
        </footer>
      </div>
    </main>
  );
}
