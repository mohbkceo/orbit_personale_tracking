import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Admin } from '../src/models/Admin.js';
import { User } from '../src/models/User.js';
import { OnboardingFlow, OnboardingConfiguration } from '../src/models/OnboardingFlow.js';
import { OnboardingResponse } from '../src/models/OnboardingResponse.js';
import { DEFAULT_FLOW, QUESTION_TYPES, answerError } from '../../shared/onboarding.js';
import { flowInput } from '../src/services/onboardingSchema.js';
import { csvCell, questionStatistics } from '../src/services/onboardingInsights.js';

let mongo, rootCookie, staffCookie, userCookie, user;
const label = (en) => ({ en, ar: `عربي ${en}` });
const q = (type = 'single', extra = {}) => ({
  id: `q_${type.replace('-', '_')}`,
  type,
  title: label(type),
  emoji: '✨',
  enabled: true,
  required: false,
  options: ['single', 'multiple', 'dropdown'].includes(type)
    ? [
        { value: 'one', label: label('One'), emoji: '🥇' },
        { value: 'two', label: label('Two'), emoji: '🥈' },
      ]
    : [],
  ...(['range', 'rating'].includes(type) ? { min: 1, max: 5, step: 1 } : {}),
  ...extra,
});
const definition = (questions = [q()]) => ({
  ...structuredClone(DEFAULT_FLOW),
  name: 'Custom onboarding',
  pages: [
    {
      ...structuredClone(DEFAULT_FLOW.pages[0]),
      id: 'profile',
      kind: 'questions',
      title: label('Profile'),
      questions,
    },
  ],
});
const cookie = (id, type) =>
  `orbit_${type}=${jwt.sign({ sub: String(id), type }, env.AUTH_JWT_SECRET, { expiresIn: '1h', issuer: 'orbit' })}`;
const adminRequest = (method, path, body, auth = rootCookie) => {
  const client = request(app);
  return client[method](`/api/admin/onboarding${path}`)
    .set('Cookie', auth)
    .set('X-Orbit-Admin-Action', '1')
    .send(body);
};
const member = (method, path = '', body) =>
  request(app)[method](`/api/me/onboarding${path}`).set('Cookie', userCookie).send(body);
async function publish(config = definition()) {
  const draft = (await adminRequest('post', '/flows', config).expect(201)).body.data;
  const published = (
    await adminRequest('post', `/flows/${draft._id}/publish`, { revision: draft.revision }).expect(
      201,
    )
  ).body.data;
  return { draft, published };
}
async function state() {
  return (await member('get').expect(200)).body.data;
}
function submit(action, answers = {}, current, extra = {}) {
  const pending = (async () => {
    const currentState = current || (await state());
    return member('patch', '/responses', {
      flowId: currentState.flow._id,
      pageId: currentState.step,
      revision: currentState.revision,
      action,
      answers,
      ...extra,
    });
  })();
  pending.expect = async (status) => {
    const response = await pending;
    expect(response.status, JSON.stringify(response.body)).toBe(status);
    return response;
  };
  return pending;
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await connectDatabase(mongo.getUri());
});
afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});
beforeEach(async () => {
  await Promise.all([
    Admin.deleteMany({}),
    User.deleteMany({}),
    OnboardingFlow.deleteMany({}),
    OnboardingConfiguration.deleteMany({}),
    OnboardingResponse.deleteMany({}),
  ]);
  await Promise.all([
    OnboardingFlow.init(),
    OnboardingConfiguration.init(),
    OnboardingResponse.init(),
    User.init(),
  ]);
  const root = await Admin.create({
    fullName: 'Root',
    email: 'root@example.com',
    passwordHash: 'unused',
    role: 'SUPER_ADMIN',
  });
  const staff = await Admin.create({
    fullName: 'Support',
    email: 'staff@example.com',
    passwordHash: 'unused',
    role: 'ADMIN',
  });
  user = await User.create({
    fullName: 'Member',
    email: 'member@example.com',
    passwordHash: 'unused',
    firstUseOnboarding: { status: 'NOT_STARTED', step: 'welcome', autoPresent: true },
  });
  rootCookie = cookie(root._id, 'admin');
  staffCookie = cookie(staff._id, 'admin');
  userCookie = cookie(user._id, 'user');
});

describe('onboarding drafts and immutable publication', () => {
  it('loads the safe default, saves/edits drafts and publishes a separate immutable snapshot', async () => {
    expect((await state()).flow.pages.map((p) => p.id)).toEqual([
      'welcome',
      'first-action',
      'telegram',
    ]);
    const { draft, published } = await publish();
    expect((await state()).flow._id).toBe(published._id);
    await adminRequest('patch', `/flows/${draft._id}`, {
      ...definition(),
      name: 'Draft changed',
      revision: 1,
    }).expect(200);
    expect((await OnboardingFlow.findById(published._id)).name).toBe('Custom onboarding');
    await adminRequest('patch', `/flows/${published._id}`, { ...definition(), revision: 0 }).expect(
      409,
    );
    await adminRequest('post', `/flows/${draft._id}/publish`, { revision: 0 }).expect(409);
    await adminRequest('post', `/flows/${published._id}/activate`).expect(200);
  });
  it('saves incomplete drafts, but rejects publication until bilingual labels/options are valid', async () => {
    const config = definition([q('single', { title: { en: '', ar: '' }, options: [] })]);
    const draft = (await adminRequest('post', '/flows', config).expect(201)).body.data;
    await adminRequest('post', `/flows/${draft._id}/publish`, { revision: 0 }).expect(422);
    config.pages[0].questions[0] = q('single');
    await adminRequest('patch', `/flows/${draft._id}`, { ...config, revision: 0 }).expect(200);
    await adminRequest('post', `/flows/${draft._id}/publish`, { revision: 1 }).expect(201);
  });
  it('rejects unsupported types, oversized data, duplicate IDs, unsafe IDs and malformed configuration', async () => {
    for (const config of [
      definition([q('script')]),
      definition([q('text'), q('text')]),
      { ...definition(), name: 'x'.repeat(121) },
    ])
      await adminRequest('post', '/flows', config).expect(422);
    for (const questions of [
      [q('range', { min: 10, max: 1 })],
      [
        q('single', {
          options: [
            { value: 'same', label: label('A') },
            { value: 'same', label: label('B') },
          ],
        }),
      ],
      [q('number', { defaultValue: 'abc' })],
    ])
      expect(flowInput.safeParse(definition(questions)).success).toBe(false);
  });
  it('prevents type changes from reusing a previously published question ID', async () => {
    await publish();
    const draft = (
      await adminRequest('post', '/flows', definition([q('text', { id: 'q_single' })])).expect(201)
    ).body.data;
    await adminRequest('post', `/flows/${draft._id}/publish`, { revision: 0 }).expect(422);
  });
  it('requires auth, Super Admin mutations and CSRF; authorized support can read reports', async () => {
    await request(app).get('/api/admin/onboarding/flows').expect(401);
    await adminRequest('post', '/flows', definition(), staffCookie).expect(403);
    await request(app)
      .post('/api/admin/onboarding/flows')
      .set('Cookie', rootCookie)
      .send(definition())
      .expect(403);
    await adminRequest('get', '/insights', undefined, staffCookie).expect(200);
    await adminRequest('get', '/export', undefined, staffCookie).expect(403);
    await request(app).get('/api/admin/onboarding/responses').set('Cookie', userCookie).expect(401);
    await request(app).patch('/api/me/onboarding/responses').send({}).expect(401);
  });
});

describe('progressive response saving', () => {
  it('persists every field type with its actual type, supports resumption and completes idempotently', async () => {
    await publish(definition(QUESTION_TYPES.map((type) => q(type))));
    const answers = {
      q_single: 'one',
      q_multiple: ['one', 'two'],
      q_dropdown: 'two',
      q_text: 'Hello',
      q_long_text: 'A longer answer',
      q_number: 0,
      q_range: 3,
      q_yes_no: false,
      q_rating: 5,
      q_date: '2026-11-02',
      q_currency: 12.5,
    };
    const started = (await submit('start').expect(200)).body.data;
    const saved = (await submit('save', answers, started).expect(200)).body.data;
    expect((await state()).answers).toEqual(answers);
    expect(saved.status).toBe('IN_PROGRESS');
    const done = (await submit('next', answers, saved).expect(200)).body.data;
    expect(done.status).toBe('COMPLETED');
    await submit('next', answers, saved).expect(200);
    expect(await OnboardingResponse.countDocuments()).toBe(1);
    expect((await state()).completedAt).toEqual(done.completedAt);
    expect((await User.findById(user._id)).firstUseOnboarding.status).toBe('COMPLETED');
  });
  it('blocks required answers and validates optional values without treating zero/false as missing', async () => {
    await publish(
      definition([
        q('number', { required: true, min: 0, max: 10 }),
        q('yes-no', { required: true }),
        q('text'),
      ]),
    );
    await submit('next').expect(422);
    await submit('save', { q_number: 11 }).expect(422);
    await submit('save', { q_number: '2' }).expect(422);
    await submit('save', { q_yes_no: 'false' }).expect(422);
    await submit('save', { unknown: 'x' }).expect(422);
    expect(
      (await submit('next', { q_number: 0, q_yes_no: false }).expect(200)).body.data.status,
    ).toBe('COMPLETED');
  });
  it('rejects invalid option values, repeated selections, dates and oversized strings', async () => {
    await publish(definition([q('single'), q('multiple'), q('date'), q('text', { maxLength: 4 })]));
    for (const answers of [
      { q_single: 'missing' },
      { q_multiple: ['one', 'one'] },
      { q_multiple: 'one' },
      { q_date: '2026-02-30' },
      { q_text: 'abcde' },
    ])
      await submit('save', answers).expect(422);
  });
  it('allows configured page/flow skips and explicitly resumes skipped sessions', async () => {
    const config = definition([q('text', { required: true })]);
    config.pages[0].allowSkip = false;
    config.settings.allowSkip = false;
    await publish(config);
    await submit('skip').expect(422);
    await submit('skip-page').expect(422);
    config.pages[0].allowSkip = true;
    config.settings.allowSkip = true;
    const next = await publish(config);
    // New settings do not replace the version already started by a rejected request.
    await adminRequest('post', `/flows/${next.published._id}/activate`).expect(200);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          firstUseOnboarding: { status: 'NOT_STARTED', autoPresent: true, attempt: 'reset' },
        },
      },
    );
    const skipped = (await submit('skip').expect(200)).body.data;
    expect(skipped.status).toBe('SKIPPED');
    expect((await submit('start', {}, skipped).expect(200)).body.data.status).toBe('SKIPPED');
    const resumed = (await submit('start', {}, skipped, { resume: true }).expect(200)).body.data;
    expect((await submit('skip-page', {}, resumed).expect(200)).body.data.status).toBe('COMPLETED');
  });
  it('pins active sessions while newly started users receive the new publication', async () => {
    const a = await publish();
    await submit('start').expect(200);
    const b = await publish(definition([q('text')]));
    expect((await state()).flow._id).toBe(a.published._id);
    const other = await User.create({
      fullName: 'Other',
      email: 'other@example.com',
      passwordHash: 'unused',
      firstUseOnboarding: { status: 'NOT_STARTED', autoPresent: true },
    });
    const result = await request(app)
      .get('/api/me/onboarding')
      .set('Cookie', cookie(other._id, 'user'))
      .expect(200);
    expect(result.body.data.flow._id).toBe(b.published._id);
  });
  it('keeps legacy in-progress tours on the default template and never re-prompts completed or older accounts', async () => {
    await publish();
    await User.updateOne(
      { _id: user._id },
      { $set: { firstUseOnboarding: { status: 'IN_PROGRESS', step: 'telegram' } } },
    );
    expect(await state()).toMatchObject({ step: 'telegram', flow: { version: 1 } });
    await User.updateOne(
      { _id: user._id },
      { $set: { firstUseOnboarding: { status: 'COMPLETED', step: 'finish' } } },
    );
    expect((await state()).autoPresent).toBe(false);
    await User.updateOne({ _id: user._id }, { $unset: { firstUseOnboarding: 1 } });
    expect((await state()).autoPresent).toBe(false);
  });
  it('rejects concurrent stale writes and retains saved answers and navigation', async () => {
    const config = definition([q('text')]);
    config.pages.push({ ...config.pages[0], id: 'second', questions: [] });
    await publish(config);
    const started = (await submit('start').expect(200)).body.data;
    const results = await Promise.all([
      submit('next', { q_text: 'Saved' }, started),
      submit('save', { q_text: 'Stale' }, started),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const current = await state();
    expect(Object.values(current.answers)).toHaveLength(1);
    if (current.step === 'second') {
      expect((await submit('back', {}, current).expect(200)).body.data.step).toBe('profile');
    }
    expect(await OnboardingResponse.countDocuments()).toBe(1);
  });
  it('honors disabled/auto-show settings while keeping existing completion and feature access separate', async () => {
    const config = definition();
    config.settings.enabled = false;
    await publish(config);
    expect(await state()).toMatchObject({ enabled: false, autoPresent: false });
    await submit('start').expect(409);
    expect((await User.findById(user._id)).onboardingCompletedAt).toBeUndefined();
  });
});

describe('insights, privacy and denominators', () => {
  it('counts answered, skipped, pending and unreached separately, including partial/completed cohorts', async () => {
    const { published } = await publish(
      definition([q('multiple'), q('number'), q('text'), q('date')]),
    );
    const make = (
      i,
      answers,
      status,
      seen = ['q_multiple', 'q_number', 'q_text', 'q_date'],
      skipped = [],
    ) => ({
      user: new mongoose.Types.ObjectId(),
      flow: published._id,
      version: published.version,
      answers,
      status,
      seenQuestions: seen,
      seenPages: ['profile'],
      skippedQuestions: skipped,
      skippedPages: skipped.length ? ['profile'] : [],
      startedAt: new Date('2026-11-01T10:00:00Z'),
      ...(status === 'completed' ? { completedAt: new Date(`2026-11-01T10:0${i}:00Z`) } : {}),
    });
    await OnboardingResponse.create([
      make(
        1,
        { q_multiple: ['one', 'two'], q_number: 0, q_text: '42', q_date: '2026-11-01' },
        'completed',
      ),
      make(2, { q_multiple: ['two'], q_number: 10 }, 'partial'),
      make(
        3,
        {},
        'skipped',
        ['q_multiple', 'q_number', 'q_text', 'q_date'],
        ['q_multiple', 'q_number', 'q_text', 'q_date'],
      ),
      make(4, {}, 'partial', []),
    ]);
    const insights = (await adminRequest('get', '/insights').expect(200)).body.data;
    expect(insights.kpis).toMatchObject({
      started: 4,
      completed: 1,
      skipped: 1,
      partial: 2,
      completionRate: 25,
      averageCompletionSeconds: 60,
      totalSubmittedResponses: 6,
    });
    expect(
      (await adminRequest('get', '/insights?from=2026-11-01&to=2026-11-01').expect(200)).body.data
        .kpis.started,
    ).toBe(4);
    expect(
      (await adminRequest('get', '/insights?from=2026-11-02&to=2026-11-02').expect(200)).body.data
        .kpis.started,
    ).toBe(0);
    const multi = insights.questions.find((q) => q.id === 'q_multiple');
    expect(multi).toMatchObject({ seen: 3, answered: 2, skipped: 1, neverReached: 1 });
    expect(multi.distribution.map((d) => d.percentage)).toEqual([50, 100]);
    const selectedQuestion = (
      await adminRequest('get', `/insights?flow=${published._id}&question=q_multiple`).expect(200)
    ).body.data;
    expect(selectedQuestion.kpis.started).toBe(4);
    expect(selectedQuestion.questions.find((q) => q.id === 'q_multiple')).toMatchObject({
      answered: 2,
      seen: 3,
      neverReached: 1,
    });
    expect(insights.questions.find((q) => q.id === 'q_number')).toMatchObject({
      average: 5,
      min: 0,
      max: 10,
      median: 5,
    });
    expect(insights.questions.find((q) => q.id === 'q_text').average).toBeUndefined();
    expect(insights.questions.find((q) => q.id === 'q_date').distribution).toEqual([
      { label: '2026-11', count: 1 },
    ]);
    const filtered = await adminRequest(
      'get',
      '/insights?question=q_multiple&answer=two&status=completed',
    ).expect(200);
    expect(filtered.body.data.kpis.started).toBe(1);
    const rows = (await adminRequest('get', '/responses?limit=1&page=2').expect(200)).body.data;
    expect(rows.rows).toHaveLength(1);
    expect(rows.total).toBe(4);
    await adminRequest('get', '/insights?from=bad').expect(422);
    await adminRequest('get', '/insights?question=constructor').expect(400);
    await adminRequest('get', '/insights?answer=one').expect(422);
  });
  it('exports filtered CSV with stable values and snapshot labels and escapes formula injection', async () => {
    await publish(definition([q('text')]));
    await submit('next', { q_text: '=IMPORTDATA("secret")' }).expect(200);
    const result = await adminRequest('get', '/export?status=completed').expect(200);
    expect(result.headers['content-type']).toContain('text/csv');
    expect(result.text).toContain('question_id');
    expect(result.text).toContain('q_text');
    expect(result.text).toContain("'=IMPORTDATA");
    expect(csvCell('a"b')).toBe('"a""b"');
    const detail = await request(app)
      .get(`/api/admin/users/${user._id}`)
      .set('Cookie', rootCookie)
      .expect(200);
    expect(detail.body.data.onboarding[0].answers.q_text).toContain('IMPORTDATA');
  });
  it('deduplicates users across explicit reset attempts in statistics', async () => {
    const { published } = await publish();
    const base = {
      user: user._id,
      flow: published._id,
      version: published.version,
      status: 'completed',
      seenQuestions: ['q_single'],
      answers: { q_single: 'one' },
    };
    await OnboardingResponse.create([
      { ...base, attempt: 'a' },
      { ...base, attempt: 'b' },
    ]);
    expect((await adminRequest('get', '/insights').expect(200)).body.data.kpis.started).toBe(1);
  });
  it('restarts the same version after the existing admin reset while retaining the original answers', async () => {
    await publish();
    await submit('next', { q_single: 'one' }).expect(200);
    await Admin.updateOne(
      { email: 'root@example.com' },
      { $set: { passwordHash: await bcrypt.hash('qa-password', 4) } },
    );
    await request(app)
      .post(`/api/admin/users/${user._id}/onboarding/reset`)
      .set('Cookie', rootCookie)
      .set('X-Orbit-Admin-Action', '1')
      .send({
        reason: 'Restart the welcome experience for this test',
        adminPassword: 'qa-password',
      })
      .expect(200);
    expect(await state()).toMatchObject({ status: 'NOT_STARTED', autoPresent: true, answers: {} });
    await submit('start').expect(200);
    expect(await OnboardingResponse.countDocuments({ user: user._id })).toBe(2);
    expect(
      (await OnboardingResponse.findOne({ user: user._id, status: 'completed' })).answers.q_single,
    ).toBe('one');
    expect((await adminRequest('get', '/insights').expect(200)).body.data.kpis).toMatchObject({
      started: 1,
      partial: 1,
      completed: 0,
    });
  });
  it('exports metadata for informational tours and paginates version history', async () => {
    await member('patch', '', { status: 'COMPLETED' }).expect(200);
    const csv = await adminRequest('get', '/export').expect(200);
    expect(csv.text).toContain(String(user._id));
    expect(csv.text).toContain('completed');
    await publish();
    const first = (await adminRequest('get', '/flows?limit=1').expect(200)).body.data;
    expect(first).toMatchObject({ page: 1, hasMore: true, total: 3 });
    const second = (await adminRequest('get', '/flows?limit=1&page=2').expect(200)).body.data;
    expect(second.flows).toHaveLength(1);
    expect(second.flows[0]._id).not.toBe(first.flows[0]._id);
    await adminRequest('get', '/flows?limit=1000').expect(422);
  });
});

describe('shared validation and statistics', () => {
  it.each(QUESTION_TYPES)('validates %s and rejects mismatched values', (type) => {
    const question = q(type, { required: true });
    expect(answerError(question, null, true)).toBe('required');
    expect(answerError(question, null, false)).toBeNull();
    const value = {
      single: 'one',
      multiple: ['one'],
      dropdown: 'one',
      text: 'hello',
      'long-text': 'hello',
      number: 0,
      range: 3,
      'yes-no': false,
      rating: 4,
      date: '2026-11-02',
      currency: 1.25,
    }[type];
    expect(answerError(question, value, true)).toBeNull();
    expect(answerError(question, { unexpected: true }, true)).not.toBeNull();
  });
  it('never converts absent numeric answers or arbitrary text to zero/numeric metrics', () => {
    const rows = [
      {
        seenQuestions: ['q_number', 'q_text'],
        skippedQuestions: [],
        answers: {},
        status: 'partial',
      },
    ];
    expect(questionStatistics(q('number'), rows).average).toBeUndefined();
    expect(
      questionStatistics(q('text'), [{ ...rows[0], answers: { q_text: '100' } }]).average,
    ).toBeUndefined();
  });
});
