import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import { adminAuth } from '../middleware/auth.js';
import { requireSuperAdmin, requireAdminCsrf } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { flowInput, draftInput } from '../services/onboardingSchema.js';
import { activeOnboarding } from '../services/onboardingService.js';
import { OnboardingFlow, OnboardingConfiguration } from '../models/OnboardingFlow.js';
import { OnboardingResponse } from '../models/OnboardingResponse.js';
import {
  cohortPipeline,
  csvCell,
  onboardingInsights,
  responseQuery,
} from '../services/onboardingInsights.js';
import { localized, emptyAnswer } from '../../../shared/onboarding.js';

export const adminOnboardingRoutes = Router();
adminOnboardingRoutes.use(adminAuth, (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
const mutation = [requireSuperAdmin, requireAdminCsrf];
const revisionInput = z.strictObject({ revision: z.number().int().min(0) });
const getFlow = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError('Flow not found', 404);
  const flow = await OnboardingFlow.findById(id);
  if (!flow) throw new AppError('Flow not found', 404);
  return flow;
};
const recordAudit = (req, event, id) =>
  audit(event, {
    actorType: 'ADMIN',
    actorId: req.admin._id,
    targetType: 'OnboardingFlow',
    targetId: id,
    ip: req.ip,
  });
adminOnboardingRoutes.get(
  '/flows',
  asyncHandler(async (req, res) => {
    const parsed = z
      .strictObject({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(100),
      })
      .safeParse(req.query);
    if (!parsed.success) throw new AppError('Invalid flow list query', 422);
    const { page, limit } = parsed.data;
    const active = await activeOnboarding();
    const [flows, total] = await Promise.all([
      OnboardingFlow.find()
        .sort({ version: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      OnboardingFlow.countDocuments(),
    ]);
    if (page === 1 && !flows.some((f) => String(f._id) === String(active._id))) flows.push(active);
    return success(res, {
      activeFlow: String(active._id),
      flows,
      page,
      total,
      hasMore: page * limit < total,
    });
  }),
);
adminOnboardingRoutes.post(
  '/flows',
  ...mutation,
  validate(draftInput),
  asyncHandler(async (req, res) => {
    await activeOnboarding();
    const counter = await OnboardingConfiguration.findOneAndUpdate(
      { key: 'global' },
      { $inc: { sequence: 1 } },
      { new: true },
    );
    const flow = await OnboardingFlow.create({
      ...req.body,
      version: counter.sequence,
      status: 'draft',
      createdBy: req.admin._id,
      updatedBy: req.admin._id,
    });
    await recordAudit(req, 'ONBOARDING_DRAFT_CREATED', flow._id);
    return success(res, flow, 201);
  }),
);
adminOnboardingRoutes.patch(
  '/flows/:id',
  ...mutation,
  validate(draftInput.safeExtend({ revision: z.number().int().min(0) })),
  asyncHandler(async (req, res) => {
    await getFlow(req.params.id);
    const { revision, ...definition } = req.body;
    const flow = await OnboardingFlow.findOneAndUpdate(
      { _id: req.params.id, status: 'draft', revision },
      { $set: { ...definition, updatedBy: req.admin._id }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!flow) throw new AppError('Draft changed or is published. Reload before editing.', 409);
    await recordAudit(req, 'ONBOARDING_DRAFT_UPDATED', flow._id);
    return success(res, flow);
  }),
);
adminOnboardingRoutes.post(
  '/flows/:id/publish',
  ...mutation,
  validate(revisionInput),
  asyncHandler(async (req, res) => {
    const draft = await getFlow(req.params.id);
    if (draft.status !== 'draft' || draft.revision !== req.body.revision)
      throw new AppError('Reload this draft before publishing', 409);
    const parsed = flowInput.safeParse({
      name: draft.name,
      pages: draft.pages,
      settings: draft.settings,
    });
    if (!parsed.success)
      throw new AppError(
        `Cannot publish: ${[...new Set(parsed.error.issues.map((issue) => issue.message))].slice(0, 5).join(' · ')}`,
        422,
        parsed.error.flatten().fieldErrors,
      );
    const history = await OnboardingFlow.find({ status: 'published' }).select('pages').lean();
    const types = new Map(
      history.flatMap((f) => f.pages.flatMap((p) => p.questions.map((q) => [q.id, q.type]))),
    );
    for (const q of draft.pages.flatMap((p) => p.questions))
      if (types.has(q.id) && types.get(q.id) !== q.type)
        throw new AppError(
          'Changing an existing question type requires a new question ID. Duplicate the question first.',
          422,
        );
    let published;
    await mongoose.connection.transaction(async (session) => {
      const lock = await OnboardingFlow.updateOne(
        { _id: draft._id, status: 'draft', revision: req.body.revision },
        { $inc: { revision: 1 } },
        { session },
      );
      if (!lock.modifiedCount) throw new AppError('Draft changed. Reload before publishing.', 409);
      const counter = await OnboardingConfiguration.findOneAndUpdate(
        { key: 'global' },
        { $inc: { sequence: 1 } },
        { new: true, session },
      );
      [published] = await OnboardingFlow.create(
        [
          {
            ...parsed.data,
            status: 'published',
            version: counter.sequence,
            createdBy: req.admin._id,
            updatedBy: req.admin._id,
            publishedAt: new Date(),
          },
        ],
        { session },
      );
      await OnboardingConfiguration.updateOne(
        { key: 'global' },
        { $set: { activeFlow: published._id } },
        { session },
      );
    });
    await recordAudit(req, 'ONBOARDING_PUBLISHED', published._id);
    return success(res, published, 201);
  }),
);
adminOnboardingRoutes.post(
  '/flows/:id/activate',
  ...mutation,
  asyncHandler(async (req, res) => {
    const flow = await getFlow(req.params.id);
    if (flow.status !== 'published')
      throw new AppError('Only published versions can be activated', 422);
    await OnboardingConfiguration.updateOne({ key: 'global' }, { $set: { activeFlow: flow._id } });
    await recordAudit(req, 'ONBOARDING_ACTIVATED', flow._id);
    return success(res, { activeFlow: String(flow._id) });
  }),
);
adminOnboardingRoutes.get(
  '/insights',
  asyncHandler(async (req, res) =>
    success(res, await onboardingInsights(responseQuery(req.query).insightsMatch)),
  ),
);
adminOnboardingRoutes.get(
  '/responses',
  asyncHandler(async (req, res) => {
    const { q, match } = responseQuery(req.query);
    const [result] = await OnboardingResponse.aggregate([
      ...cohortPipeline(match),
      { $sort: { updatedAt: -1 } },
      {
        $facet: {
          count: [{ $count: 'total' }],
          rows: [
            { $skip: (q.page - 1) * q.limit },
            { $limit: q.limit },
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                pipeline: [{ $project: { fullName: 1 } }],
                as: 'identity',
              },
            },
            {
              $lookup: {
                from: 'onboardingflows',
                localField: 'flow',
                foreignField: '_id',
                pipeline: [{ $project: { pages: 1 } }],
                as: 'definition',
              },
            },
          ],
        },
      },
    ]);
    return success(res, {
      rows: result.rows,
      total: result.count[0]?.total || 0,
      page: q.page,
      limit: q.limit,
    });
  }),
);
adminOnboardingRoutes.get(
  '/export',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const { match } = responseQuery(req.query);
    const flows = await OnboardingFlow.find({ status: 'published' }).lean();
    const definitions = new Map(flows.map((f) => [String(f._id), f]));
    await audit('ONBOARDING_RESPONSES_EXPORTED', {
      actorType: 'ADMIN',
      actorId: req.admin._id,
      targetType: 'OnboardingResponse',
      ip: req.ip,
    });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orbit-onboarding.csv"',
    });
    res.write('\uFEFF');
    res.write(
      [
        'user_id',
        'version',
        'plan_at_start',
        'status',
        'started_at',
        'completed_at',
        'question_id',
        'question_en',
        'question_ar',
        'type',
        'answer_values',
        'answer_labels_en',
        'answer_labels_ar',
        'seen',
        'skipped',
      ]
        .map(csvCell)
        .join(',') + '\r\n',
    );
    const cursor = OnboardingResponse.aggregate(cohortPipeline(match)).cursor({ batchSize: 100 });
    for await (const row of cursor) {
      if (res.destroyed) break;
      const flow = definitions.get(String(row.flow));
      const questions =
        flow?.pages.filter((p) => p.enabled).flatMap((p) => p.questions.filter((q) => q.enabled)) ||
        [];
      // Informational tours still export their submission metadata.
      for (const q of questions.length ? questions : [null]) {
        if (res.destroyed) break;
        const value = q ? row.answers?.[q.id] : null;
        const values = Array.isArray(value) ? value : [value];
        const labels = emptyAnswer(value)
          ? ''
          : values
              .map((v) => localized(q?.options?.find((o) => o.value === v)?.label) || String(v))
              .join(' | ');
        const arabicLabels = emptyAnswer(value)
          ? ''
          : values
              .map(
                (v) => localized(q?.options?.find((o) => o.value === v)?.label, 'ar') || String(v),
              )
              .join(' | ');
        const line =
          [
            row.user,
            row.version,
            row.plan,
            row.status,
            row.startedAt?.toISOString(),
            row.completedAt?.toISOString(),
            q?.id,
            q?.title.en,
            q?.title.ar,
            q?.type,
            emptyAnswer(value) ? '' : Array.isArray(value) ? value.join(' | ') : value,
            labels,
            arabicLabels,
            q ? row.seenQuestions.includes(q.id) : '',
            q ? row.skippedQuestions.includes(q.id) : '',
          ]
            .map(csvCell)
            .join(',') + '\r\n';
        if (!res.write(line) && !res.destroyed)
          await new Promise((resolve) => {
            const finish = () => {
              res.off('drain', finish);
              res.off('close', finish);
              resolve();
            };
            res.once('drain', finish);
            res.once('close', finish);
          });
      }
    }
    res.end();
  }),
);
