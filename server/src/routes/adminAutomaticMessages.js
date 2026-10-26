import { Router } from 'express';
import { z } from 'zod';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { requireAdminCsrf, requireSuperAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { automaticDefinition, automaticTemplateHistory, getAutomaticTemplate, listAutomaticTemplates, renderAutomaticMessage, resetAutomaticTemplate, restoreAutomaticTemplate, updateAutomaticTemplate } from '../services/automaticMessages.js';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { sendTelegramNotification } from '../telegram/notifier.js';

export const adminAutomaticMessageRoutes = Router();
adminAutomaticMessageRoutes.use(adminAuth, adminRoleGuard('ADMIN', 'SUPER_ADMIN'));
adminAutomaticMessageRoutes.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : requireAdminCsrf(req, res, next));
const content = z.strictObject({ title: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(3800) });
const input = z.strictObject({ enabled: z.boolean(), variants: z.strictObject({ en: content, ar: content }), buttons: z.array(z.array(z.strictObject({ label: z.string().trim().min(1).max(64), url: z.url() })).min(1).max(4)).max(8).default([]), imageId: z.string().regex(/^[a-f\d]{24}$/i).nullable().default(null) });
const key = (value) => { if (!automaticDefinition(value)) throw new AppError('Unknown automatic message', 404); return value; };
const log = (req, action, template) => audit(action, { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'AutomaticMessageTemplate', targetId: template._id, metadata: { key: template.key, revision: template.revision } });

adminAutomaticMessageRoutes.get('/', asyncHandler(async (_req, res) => success(res, await listAutomaticTemplates())));
adminAutomaticMessageRoutes.get('/:key', asyncHandler(async (req, res) => success(res, await getAutomaticTemplate(key(req.params.key)))));
adminAutomaticMessageRoutes.put('/:key', requireSuperAdmin, validate(input), asyncHandler(async (req, res) => {
  const template = await updateAutomaticTemplate(key(req.params.key), req.body, req.admin._id);
  await log(req, 'AUTOMATIC_TEMPLATE_UPDATED', template);
  return success(res, template);
}));
adminAutomaticMessageRoutes.post('/:key/reset', requireSuperAdmin, asyncHandler(async (req, res) => {
  const template = await resetAutomaticTemplate(key(req.params.key), req.admin._id);
  await log(req, 'AUTOMATIC_TEMPLATE_RESET', template); return success(res, template);
}));
adminAutomaticMessageRoutes.get('/:key/history', asyncHandler(async (req, res) => success(res, await automaticTemplateHistory(key(req.params.key), Math.max(1, Number(req.query.page) || 1)))));
adminAutomaticMessageRoutes.post('/:key/restore/:revision', requireSuperAdmin, asyncHandler(async (req, res) => {
  const template = await restoreAutomaticTemplate(key(req.params.key), Number(req.params.revision), req.admin._id);
  await log(req, 'AUTOMATIC_TEMPLATE_RESTORED', template); return success(res, template);
}));
adminAutomaticMessageRoutes.post('/:key/preview', validate(z.strictObject({ language: z.enum(['en', 'ar']).default('en') })), asyncHandler(async (req, res) => {
  const definition = automaticDefinition(key(req.params.key));
  const samples = Object.fromEntries(definition.variables.map((variable) => [variable, ({ legacyTitle: definition.name, legacyMessage: 'Sample Orbit notification', taskTitle: 'Review project', dueDate: '31 Dec 2026', amount: '2,500', currency: 'DZD', completedCount: '2', totalCount: '3' })[variable] || `Sample ${variable}`]));
  return success(res, await renderAutomaticMessage(definition.key, req.body.language, samples, { preview: true }));
}));
adminAutomaticMessageRoutes.post('/:key/test', validate(z.strictObject({ recipientUserId: z.string().regex(/^[a-f\d]{24}$/i), language: z.enum(['en', 'ar']).default('en') })), asyncHandler(async (req, res) => {
  const definition = automaticDefinition(key(req.params.key));
  const user = await User.findById(req.body.recipientUserId).select('email status');
  if (!user || user.status !== 'ACTIVE' || user.email !== req.admin.email || !(await TelegramConnection.exists({ user: user._id }))) throw new AppError('Test recipient must be your active linked user account', 403);
  const samples = Object.fromEntries(definition.variables.map((variable) => [variable, ({ legacyTitle: definition.name, legacyMessage: 'Sample Orbit notification' })[variable] || `Sample ${variable}`]));
  const rendered = await renderAutomaticMessage(definition.key, req.body.language, samples, { preview: true });
  const result = await sendTelegramNotification(user._id, rendered);
  if (!result.sent) throw new AppError('Test recipient is not eligible for Telegram delivery', 409);
  await audit('AUTOMATIC_TEMPLATE_TEST_SENT', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'AutomaticMessageTemplate', metadata: { key: definition.key, recipientUserId: user._id } });
  return success(res, result);
}));
