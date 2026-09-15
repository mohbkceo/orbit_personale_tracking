import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { taskInput, taskUpdate } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { archiveTask, createTask, listTasks, updateTask } from '../services/taskService.js';

export const taskRoutes = Router();
taskRoutes.get('/', asyncHandler(async (req, res) => { const result = await listTasks(req.query); return success(res, result.data, 200, { pagination: result.pagination }); }));
taskRoutes.post('/', validate(taskInput), asyncHandler(async (req, res) => success(res, await createTask(req.body), 201)));
taskRoutes.patch('/:id', validate(taskUpdate), asyncHandler(async (req, res) => success(res, await updateTask(req.params.id, req.body))));
taskRoutes.delete('/:id', asyncHandler(async (req, res) => success(res, await archiveTask(req.params.id))));
