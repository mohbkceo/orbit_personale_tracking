import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { settingsInput } from '../validators/schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { getSettingsDocument, publicSettings, updateSettings } from '../services/settingsService.js';
import { recordActivity } from '../services/activityService.js';

export const settingsRoutes = Router();
settingsRoutes.get('/', asyncHandler(async (req, res) => success(res, publicSettings(await getSettingsDocument(req.user._id)))));
settingsRoutes.patch('/', validate(settingsInput), asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.user._id, req.body);
  await recordActivity(req.user._id, { action: 'updated', entityType: 'Settings', entityId: settings._id, description: 'Settings updated' });
  return success(res, publicSettings(settings));
}));
