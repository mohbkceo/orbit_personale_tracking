import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { dashboardCharts, dashboardSummary } from '../services/dashboardService.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/summary', asyncHandler(async (req, res) => success(res, await dashboardSummary(req.user._id))));
dashboardRoutes.get('/charts', asyncHandler(async (req, res) => success(res, await dashboardCharts(req.user._id, Math.min(Number(req.query.months) || 6, 24)))));
