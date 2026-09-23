import { Router } from 'express';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { automationSettingsInput } from '../validators/automationSettings.js';
import { getAutomationSettings, updateAutomationSettings } from '../services/automationSettings.service.js';

export const adminAutomationSettingsRoutes = Router();
adminAutomationSettingsRoutes.use(adminAuth, adminRoleGuard('SUPER_ADMIN'));
adminAutomationSettingsRoutes.get('/', asyncHandler(async (_req, res) => success(res, await getAutomationSettings())));
adminAutomationSettingsRoutes.put('/', validate(automationSettingsInput), asyncHandler(async (req, res) => success(res, await updateAutomationSettings(req.body))));
