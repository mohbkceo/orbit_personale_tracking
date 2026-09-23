import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { taskInput, taskUpdate } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { archiveTask, createTask, listTasks, updateTask } from '../services/taskService.js';
import { executeTask } from '../services/taskExecution.service.js';
import { z } from 'zod';

export const taskRoutes = Router();
taskRoutes.get('/', asyncHandler(async (req, res) => { const result = await listTasks(req.user._id, req.query); return success(res, result.data, 200, { pagination: result.pagination }); }));
taskRoutes.post('/', validate(taskInput), asyncHandler(async (req, res) => success(res, await createTask(req.user._id, req.body), 201)));
taskRoutes.patch('/:id', validate(taskUpdate), asyncHandler(async (req, res) => success(res, await updateTask(req.user._id, req.params.id, req.body))));
taskRoutes.post('/:id/execute', validate(z.object({ action: z.enum(['start', 'continue', 'done', 'blocked', 'later', 'stop', 'reschedule', 'backlog', 'drop']), reason: z.string().max(500).optional(), dueDate: z.coerce.date().optional() })), asyncHandler(async (req, res) => success(res, await executeTask(req.user._id, req.params.id, req.body.action, { channel: 'web', reason: req.body.reason, dueDate: req.body.dueDate }))));
taskRoutes.delete('/:id', asyncHandler(async (req, res) => success(res, await archiveTask(req.user._id, req.params.id))));
