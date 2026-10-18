import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { User } from '../models/User.js';
import { Task } from '../models/Task.js';
import { Account } from '../models/Account.js';

export const meOnboardingRoutes = Router();
const input = z.strictObject({
  status: z.enum(['IN_PROGRESS', 'SKIPPED', 'COMPLETED']),
  step: z.enum(['welcome', 'first-action', 'telegram', 'finish']).optional(),
  resume: z.boolean().optional(),
});

function state(user) {
  const saved = user.firstUseOnboarding;
  return {
    status: saved?.status || 'NOT_STARTED',
    step: saved?.step || 'welcome',
    autoPresent: saved?.status === 'NOT_STARTED' && saved?.autoPresent === true,
    completedAt: saved?.completedAt || null,
  };
}

meOnboardingRoutes.get('/onboarding', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const current = state(req.user);
  if (!current.autoPresent && req.query.details !== '1') return success(res, current);
  const [task, account] = await Promise.all([
    Task.exists({ user: req.user._id, archived: false }),
    Account.exists({ user: req.user._id, archived: false }),
  ]);
  return success(res, { ...current, actions: { task: Boolean(task), account: Boolean(account) } });
}));

meOnboardingRoutes.patch('/onboarding', validate(input), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const current = req.user.firstUseOnboarding;
  if (current?.status === 'COMPLETED') return success(res, state(req.user));
  const { status, step } = req.body;
  if (current?.status === 'SKIPPED' && status === 'IN_PROGRESS' && req.body.resume !== true) return success(res, state(req.user));
  const now = new Date();
  const update = { 'firstUseOnboarding.status': status, 'firstUseOnboarding.autoPresent': false };
  if (status === 'IN_PROGRESS') {
    update['firstUseOnboarding.step'] = step || current?.step || 'welcome';
    if (!current?.startedAt) update['firstUseOnboarding.startedAt'] = now;
  }
  if (status === 'SKIPPED') update['firstUseOnboarding.dismissedAt'] = current?.dismissedAt || now;
  if (status === 'COMPLETED') {
    update['firstUseOnboarding.step'] = 'finish';
    update['firstUseOnboarding.completedAt'] = current?.completedAt || now;
  }
  // The filter also protects a Skip or Complete saved while another request was in flight.
  const allowedStatuses = status === 'IN_PROGRESS'
    ? (req.body.resume === true ? { $ne: 'COMPLETED' } : { $nin: ['SKIPPED', 'COMPLETED'] })
    : status === 'SKIPPED' ? { $ne: 'COMPLETED' } : null;
  const filter = { _id: req.user._id, ...(allowedStatuses ? { 'firstUseOnboarding.status': allowedStatuses } : {}) };
  const user = await User.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true });
  return success(res, state(user || await User.findById(req.user._id)));
}));
