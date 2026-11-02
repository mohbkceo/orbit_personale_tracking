import {
  DEFAULT_FLOW,
  enabledPages,
  emptyAnswer,
  answerError,
} from '../../../shared/onboarding.js';
import { OnboardingFlow, OnboardingConfiguration } from '../models/OnboardingFlow.js';
import { OnboardingResponse } from '../models/OnboardingResponse.js';
import { User } from '../models/User.js';
import { currentSubscription } from './accessService.js';
import { AppError } from '../utils/AppError.js';

export async function activeOnboarding() {
  let config = await OnboardingConfiguration.findOne({ key: 'global' }).lean();
  if (!config?.activeFlow) {
    const fallback = await OnboardingFlow.findOneAndUpdate(
      { key: 'orbit', version: 1 },
      { $setOnInsert: { ...DEFAULT_FLOW, status: 'published', publishedAt: new Date() } },
      { upsert: true, new: true },
    );
    config = await OnboardingConfiguration.findOneAndUpdate(
      { key: 'global' },
      { $setOnInsert: { activeFlow: fallback._id, sequence: 1 } },
      { upsert: true, new: true },
    ).lean();
  }
  const flow = await OnboardingFlow.findById(config.activeFlow).lean();
  if (!flow || flow.status !== 'published')
    throw new AppError('Published onboarding unavailable', 503);
  return flow;
}

export async function onboardingState(user, { pin = false } = {}) {
  const active = await activeOnboarding();
  if (pin && !user.firstUseOnboarding?.flow) {
    const legacy =
      user.firstUseOnboarding?.status === 'IN_PROGRESS'
        ? await OnboardingFlow.findOne({ key: 'orbit', version: 1 }).lean()
        : null;
    user =
      (await User.findOneAndUpdate(
        { _id: user._id, 'firstUseOnboarding.flow': null },
        { $set: { 'firstUseOnboarding.flow': legacy?._id || active._id } },
        { new: true },
      )) || (await User.findById(user._id));
  }
  const saved = user.firstUseOnboarding || {};
  const flow = saved.flow ? await OnboardingFlow.findById(saved.flow).lean() : active;
  if (!flow || flow.status !== 'published')
    throw new AppError('Published onboarding unavailable', 503);
  const attempt = saved.attempt || 'initial';
  const response = saved.flow
    ? await OnboardingResponse.findOne({ user: user._id, flow: saved.flow, attempt }).lean()
    : null;
  const status = response
    ? { partial: 'IN_PROGRESS', completed: 'COMPLETED', skipped: 'SKIPPED' }[response.status]
    : saved.status || 'NOT_STARTED';
  return {
    userId: String(user._id),
    attempt,
    status,
    step: enabledPages(flow).some((p) => p.id === (response?.pageId || saved.step))
      ? response?.pageId || saved.step
      : enabledPages(flow)[0]?.id,
    autoPresent:
      active.settings.enabled &&
      active.settings.autoShow &&
      status === 'NOT_STARTED' &&
      saved.autoPresent === true,
    enabled: active.settings.enabled,
    completedAt: response?.completedAt || saved.completedAt || null,
    flow,
    answers: response?.answers || {},
    revision: response?.revision || 0,
  };
}

export async function saveOnboarding(user, input) {
  const state = await onboardingState(user, { pin: true });
  const { flow } = state;
  if (input.flowId && String(flow._id) !== input.flowId)
    throw new AppError(
      'Reload the current onboarding version',
      409,
      undefined,
      'ONBOARDING_CONFLICT',
    );
  const pages = enabledPages(flow);
  const page =
    pages.find((p) => p.id === (input.pageId || state.step)) || (!input.pageId ? pages[0] : null);
  if (!page) throw new AppError('Unknown onboarding page', 422);
  if (state.status === 'COMPLETED' || (state.status === 'SKIPPED' && !input.resume)) return state;
  if (!state.enabled) throw new AppError('Onboarding is disabled', 409);
  if (input.action === 'skip' && !flow.settings.allowSkip)
    throw new AppError('Skipping this onboarding is disabled', 422);
  if (input.action === 'skip-page' && !page.allowSkip)
    throw new AppError('This page cannot be skipped', 422);
  let response = await OnboardingResponse.findOne({
    user: user._id,
    flow: flow._id,
    attempt: state.attempt,
  }).lean();
  if (!response) {
    const subscription = await currentSubscription(user._id);
    response = await OnboardingResponse.findOneAndUpdate(
      { user: user._id, flow: flow._id, attempt: state.attempt },
      {
        $setOnInsert: {
          version: flow.version,
          plan:
            subscription?.expiresAt > new Date()
              ? subscription.planSnapshot?.name || 'Paid'
              : 'Free',
          pageId: page.id,
          startedAt: user.firstUseOnboarding?.startedAt || new Date(),
        },
      },
      { upsert: true, new: true },
    ).lean();
  }
  if (input.revision != null && input.revision !== response.revision)
    throw new AppError(
      'Progress changed in another tab. Reload to resume; unsaved answers remain on this device.',
      409,
      undefined,
      'ONBOARDING_CONFLICT',
    );
  if (input.pageId && response.pageId !== input.pageId)
    throw new AppError('Page changed. Reload to resume.', 409, undefined, 'ONBOARDING_CONFLICT');
  const answers = { ...response.answers };
  const errors = {};
  for (const [id, value] of Object.entries(input.answers || {})) {
    const q = page.questions.find((q) => q.id === id && q.enabled);
    if (!q) throw new AppError('Unknown or disabled question', 422);
    const invalid = answerError(q, value, false);
    if (invalid) errors[id] = invalid;
    else if (emptyAnswer(value)) delete answers[id];
    else answers[id] = value;
  }
  const advancing = ['next', 'complete'].includes(input.action);
  if (advancing)
    for (const q of page.questions.filter((q) => q.enabled)) {
      const invalid = answerError(q, answers[q.id], true);
      if (invalid) errors[q.id] = invalid;
    }
  if (Object.keys(errors).length) throw new AppError('Please check your answers', 422, errors);
  const seenPages = new Set(response.seenPages),
    seenQuestions = new Set(response.seenQuestions);
  const passedPages = new Set(response.passedPages),
    skippedPages = new Set(response.skippedPages),
    skippedQuestions = new Set(response.skippedQuestions);
  const visit = (p) => {
    seenPages.add(p.id);
    p.questions.filter((q) => q.enabled).forEach((q) => seenQuestions.add(q.id));
  };
  visit(page);
  if (advancing || input.action === 'skip-page') {
    passedPages.add(page.id);
    if (input.action === 'skip-page') skippedPages.add(page.id);
    else skippedPages.delete(page.id);
    for (const q of page.questions.filter((q) => q.enabled)) {
      if (emptyAnswer(answers[q.id])) skippedQuestions.add(q.id);
      else skippedQuestions.delete(q.id);
    }
  }
  let pageId = page.id,
    status = 'partial';
  const index = pages.indexOf(page);
  if (input.action === 'back') {
    const prev = pages[Math.max(index - 1, 0)];
    pageId = prev.id;
  }
  if (input.action === 'next' || input.action === 'skip-page') {
    if (index < pages.length - 1) {
      pageId = pages[index + 1].id;
    } else status = 'completed';
  }
  if (input.action === 'complete') status = 'completed';
  if (input.action === 'skip') {
    status = 'skipped';
    skippedPages.add(page.id);
    page.questions
      .filter((q) => q.enabled && emptyAnswer(answers[q.id]))
      .forEach((q) => skippedQuestions.add(q.id));
  }
  if (input.targetStep) {
    const target = pages.find((p) => p.id === input.targetStep);
    if (!target) throw new AppError('Unknown onboarding page', 422);
    pageId = target.id;
    visit(target);
  }
  if (status === 'completed') {
    for (const p of pages) {
      if (skippedPages.has(p.id) && p.allowSkip) continue;
      for (const q of p.questions.filter((q) => q.enabled))
        if (answerError(q, answers[q.id], true)) errors[q.id] = 'required';
      if (p.questions.some((q) => q.enabled && q.required) && !passedPages.has(p.id))
        errors[p.id] = 'Page not completed';
    }
    if (Object.keys(errors).length)
      throw new AppError('Complete required pages before finishing', 422, errors);
  }
  const now = new Date();
  const saved = await OnboardingResponse.findOneAndUpdate(
    { _id: response._id, revision: response.revision },
    {
      $set: {
        answers,
        status,
        pageId,
        seenPages: [...seenPages],
        seenQuestions: [...seenQuestions],
        passedPages: [...passedPages],
        skippedPages: [...skippedPages],
        skippedQuestions: [...skippedQuestions],
        ...(status === 'completed' ? { completedAt: response.completedAt || now } : {}),
        ...(status === 'skipped' ? { skippedAt: response.skippedAt || now } : {}),
      },
      $inc: { revision: 1 },
    },
    { new: true },
  );
  if (!saved)
    throw new AppError(
      'Progress changed. Reload to resume.',
      409,
      undefined,
      'ONBOARDING_CONFLICT',
    );
  // The response revision is authoritative; concurrent stale mirrors cannot overwrite newer progress.
  await User.updateOne(
    {
      _id: user._id,
      'firstUseOnboarding.flow': flow._id,
      'firstUseOnboarding.attempt': user.firstUseOnboarding?.attempt || null,
      $or: [
        { 'firstUseOnboarding.revision': { $exists: false } },
        { 'firstUseOnboarding.revision': { $lt: saved.revision } },
      ],
    },
    {
      $set: {
        'firstUseOnboarding.status': {
          partial: 'IN_PROGRESS',
          completed: 'COMPLETED',
          skipped: 'SKIPPED',
        }[status],
        'firstUseOnboarding.step': status === 'completed' ? 'finish' : pageId,
        'firstUseOnboarding.autoPresent': false,
        'firstUseOnboarding.startedAt': response.startedAt,
        'firstUseOnboarding.revision': saved.revision,
        ...(status === 'completed' ? { 'firstUseOnboarding.completedAt': saved.completedAt } : {}),
        ...(status === 'skipped' ? { 'firstUseOnboarding.dismissedAt': saved.skippedAt } : {}),
      },
    },
  );
  return onboardingState(await User.findById(user._id));
}
