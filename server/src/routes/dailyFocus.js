import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getDailyFocus, addFocusTask, finishFocusPlanning, removeFocusTask, reviewFocusTask, focusProgress } from '../services/dailyFocus.service.js';
import { getAutomationSettings } from '../services/automationSettings.service.js';

export const dailyFocusRoutes = Router();
dailyFocusRoutes.get('/today', asyncHandler(async (req, res) => { const [focus, rules] = await Promise.all([getDailyFocus(req.user._id), getAutomationSettings()]); return success(res, { ...focus.toObject(), progress: focusProgress(focus), maxTasks: rules.dailyFocus.maxTasks, enabled: rules.general.enabled && rules.dailyFocus.enabled }); }));
dailyFocusRoutes.post('/today/items', validate(z.object({ taskId: z.string().regex(/^[a-f\d]{24}$/i).optional(), title: z.string().trim().max(180).optional() }).refine((v) => v.taskId || v.title)), asyncHandler(async (req, res) => success(res, await addFocusTask(req.user._id, req.body), 201)));
dailyFocusRoutes.post('/today/done', asyncHandler(async (req, res) => success(res, await finishFocusPlanning(req.user._id))));
dailyFocusRoutes.delete('/today/items/:taskId', asyncHandler(async (req, res) => success(res, await removeFocusTask(req.user._id, req.params.taskId))));
dailyFocusRoutes.post('/:date/items/:taskId/review', validate(z.object({ decision: z.enum(['tomorrow', 'backlog', 'reschedule', 'drop']), dueDate: z.coerce.date().optional() })), asyncHandler(async (req, res) => success(res, await reviewFocusTask(req.user._id, req.params.date, req.params.taskId, req.body.decision, 'web', req.body.dueDate))));
