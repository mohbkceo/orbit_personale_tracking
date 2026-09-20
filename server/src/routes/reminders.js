import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { reminderInput, reminderUpdate } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { ReminderEvent } from '../models/ReminderEvent.js';
import { AppError } from '../utils/AppError.js';
import {
  cancelReminder,
  completeReminder,
  createReminder,
  getReminder,
  linkedEntity,
  listReminders,
  markReminderBlocked,
  regenerateAutomaticReminderPlan,
  resumeReminder,
  setEntityReminderMode,
  snoozeReminder,
  updateReminder,
} from '../services/reminders/reminderService.js';

export const reminderRoutes = Router();
const id = z.string().regex(/^[a-f\d]{24}$/i);
const params = z.object({ id });
const entityParams = z.object({
  entityType: z.enum(['task', 'debt', 'bill', 'subscription', 'goal']),
  entityId: id,
});
const reminderQuery = z.object({
  status: z
    .enum([
      'scheduled',
      'active',
      'snoozed',
      'waiting',
      'completed',
      'cancelled',
      'expired',
      'suppressed',
    ])
    .optional(),
  entityType: z.enum(['task', 'debt', 'bill', 'subscription', 'goal', 'custom']).optional(),
  entityId: id.optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

reminderRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = reminderQuery.safeParse(req.query);
    if (!parsed.success) throw new AppError('Invalid reminder filter', 400);
    const result = await listReminders(req.user._id, parsed.data);
    return success(res, result.data, 200, { pagination: result.pagination });
  }),
);
reminderRoutes.post(
  '/',
  validate(reminderInput),
  asyncHandler(async (req, res) => success(res, await createReminder(req.user._id, req.body), 201)),
);
reminderRoutes.get(
  '/entity/:entityType/:entityId/mode',
  validate(entityParams, 'params'),
  asyncHandler(async (req, res) => {
    const item = await linkedEntity(req.user._id, req.params.entityType, req.params.entityId);
    return success(res, {
      mode: item.reminderMode || 'automatic',
      title: item.title || item.name || item.personName,
    });
  }),
);
reminderRoutes.patch(
  '/entity/:entityType/:entityId/mode',
  validate(entityParams, 'params'),
  validate(z.object({ mode: z.enum(['automatic', 'custom', 'off']) })),
  asyncHandler(async (req, res) =>
    success(
      res,
      await setEntityReminderMode(
        req.user._id,
        req.params.entityType,
        req.params.entityId,
        req.body.mode,
      ),
    ),
  ),
);
reminderRoutes.get(
  '/entity/:entityType/:entityId',
  validate(entityParams, 'params'),
  asyncHandler(async (req, res) => {
    const result = await listReminders(req.user._id, { ...req.params, limit: 100 });
    return success(res, result.data);
  }),
);
reminderRoutes.post(
  '/entity/:entityType/:entityId/regenerate',
  validate(entityParams, 'params'),
  asyncHandler(async (req, res) =>
    success(
      res,
      await regenerateAutomaticReminderPlan(
        req.user._id,
        req.params.entityType,
        req.params.entityId,
        { restore: true },
      ),
    ),
  ),
);
reminderRoutes.get(
  '/:id',
  validate(params, 'params'),
  asyncHandler(async (req, res) => success(res, await getReminder(req.user._id, req.params.id))),
);
reminderRoutes.get(
  '/:id/events',
  validate(params, 'params'),
  asyncHandler(async (req, res) => {
    await getReminder(req.user._id, req.params.id);
    return success(
      res,
      await ReminderEvent.find({ user: req.user._id, reminderId: req.params.id })
        .sort({ timestamp: -1 })
        .limit(100),
    );
  }),
);
reminderRoutes.patch(
  '/:id',
  validate(params, 'params'),
  validate(reminderUpdate),
  asyncHandler(async (req, res) =>
    success(res, await updateReminder(req.user._id, req.params.id, req.body)),
  ),
);
reminderRoutes.delete(
  '/:id',
  validate(params, 'params'),
  asyncHandler(async (req, res) => success(res, await cancelReminder(req.user._id, req.params.id))),
);
reminderRoutes.post(
  '/:id/complete',
  validate(params, 'params'),
  asyncHandler(async (req, res) =>
    success(res, await completeReminder(req.user._id, req.params.id)),
  ),
);
reminderRoutes.post(
  '/:id/snooze',
  validate(params, 'params'),
  validate(z.object({ until: z.coerce.date() })),
  asyncHandler(async (req, res) =>
    success(res, await snoozeReminder(req.user._id, req.params.id, req.body.until)),
  ),
);
reminderRoutes.post(
  '/:id/block',
  validate(params, 'params'),
  validate(
    z.object({
      reason: z.enum(['waiting_for_info', 'waiting_for_someone', 'not_enough_time', 'other']),
      note: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) =>
    success(
      res,
      await markReminderBlocked(req.user._id, req.params.id, req.body.reason, req.body.note),
    ),
  ),
);
reminderRoutes.post(
  '/:id/resume',
  validate(params, 'params'),
  validate(z.object({ at: z.coerce.date().optional() })),
  asyncHandler(async (req, res) =>
    success(res, await resumeReminder(req.user._id, req.params.id, req.body.at)),
  ),
);
