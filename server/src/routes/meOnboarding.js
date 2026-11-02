import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Account } from '../models/Account.js';
import { onboardingState, saveOnboarding } from '../services/onboardingService.js';
import { stableId } from '../services/onboardingSchema.js';

export const meOnboardingRoutes = Router();
meOnboardingRoutes.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
meOnboardingRoutes.get(
  '/onboarding',
  asyncHandler(async (req, res) => {
    const current = await onboardingState(req.user, {
      pin: req.user.firstUseOnboarding?.status === 'IN_PROGRESS',
    });
    if (current.autoPresent || req.query.details === '1') {
      const [task, account] = await Promise.all([
        Task.exists({ user: req.user._id, archived: false }),
        Account.exists({ user: req.user._id, archived: false }),
      ]);
      current.actions = { task: Boolean(task), account: Boolean(account) };
    }
    return success(res, current);
  }),
);
const responseInput = z.strictObject({
  flowId: z.string().regex(/^[a-f\d]{24}$/i),
  revision: z.number().int().min(0),
  pageId: stableId,
  action: z.enum(['start', 'save', 'next', 'back', 'skip-page', 'skip', 'complete']),
  resume: z.boolean().optional(),
  answers: z
    .record(
      stableId,
      z.union([
        z.string().max(5000),
        z.number().finite(),
        z.boolean(),
        z.array(stableId).max(100),
        z.null(),
      ]),
    )
    .default({}),
});
meOnboardingRoutes.patch(
  '/onboarding/responses',
  validate(responseInput),
  asyncHandler(async (req, res) => success(res, await saveOnboarding(req.user, req.body))),
);
meOnboardingRoutes.patch(
  '/onboarding',
  validate(
    z.strictObject({
      status: z.enum(['IN_PROGRESS', 'SKIPPED', 'COMPLETED']),
      step: stableId.optional(),
      resume: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { status, step, resume } = req.body;
    return success(
      res,
      await saveOnboarding(req.user, {
        action: status === 'COMPLETED' ? 'complete' : status === 'SKIPPED' ? 'skip' : 'start',
        targetStep: step === 'finish' ? undefined : step,
        resume,
      }),
    );
  }),
);
meOnboardingRoutes.patch(
  '/plan-selection',
  validate(z.strictObject({ status: z.literal('SKIPPED') })),
  asyncHandler(async (req, res) => {
    await User.updateOne(
      { _id: req.user._id, planSelectionSkippedAt: { $exists: false } },
      { $set: { planSelectionSkippedAt: new Date() } },
    );
    return success(res, { status: 'SKIPPED' });
  }),
);
