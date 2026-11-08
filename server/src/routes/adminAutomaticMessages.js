import { Router } from 'express';
import { z } from 'zod';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { requireAdminCsrf, requireSuperAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { automaticDefinition, automaticTemplateHistory, getAutomaticTemplate, listAutomaticTemplates, renderAutomaticMessage, renderAutomaticContent, validateAutomaticContent, resetAutomaticTemplate, restoreAutomaticTemplate, updateAutomaticTemplate } from '../services/automaticMessages.js';
import { prepareAutomaticTiming, applyAutomaticTiming } from '../services/automaticMessageTiming.js';
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
adminAutomaticMessageRoutes.put('/:key', requireSuperAdmin, validate(input.extend({ timing: z.record(z.string(), z.unknown()).optional() })), asyncHandler(async (req, res) => {
  const templateKey = key(req.params.key);
  const timing = await prepareAutomaticTiming(templateKey, req.body.timing);
  const template = await updateAutomaticTemplate(templateKey, req.body, req.admin._id);
  await log(req, 'AUTOMATIC_TEMPLATE_UPDATED', template);
  try { await applyAutomaticTiming(timing); }
  catch { throw new AppError('Message saved, but timing could not be saved. Please try saving again.', 500); }
  if (timing) await audit('AUTOMATIC_TIMING_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'AutomaticMessageTemplate', targetId: template._id, metadata: { key: templateKey, timing: req.body.timing } });
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
adminAutomaticMessageRoutes.post('/:key/preview', validate(z.strictObject({ language: z.enum(['en', 'ar']).default('en'), content: input.optional() })), asyncHandler(async (req, res) => {
  const definition = automaticDefinition(key(req.params.key));
  const examples = { legacyTitle: definition.name, legacyMessage: ({ TASKS: 'Today: Review project proposal, send invoice, and prepare for your exam.', FOCUS: 'You completed 2 of your 3 focus tasks today.', DEBT: '2,500 DZD remaining for Ahmed, due on 12 November.', BILL: 'Your internet bill of 2,500 DZD is due on 12 November.', SUBSCRIPTION: 'Your Orbit subscription renews on 12 November.', GOAL: 'Your learning goal is 65% complete. Time for a quick review.', EVENT: 'Algiers Tech Meetup starts on 12 November at 14:00.', SUMMARY: '3 open tasks, 1 overdue. Your balance is 12,500 DZD.', REMINDER: 'Review your project proposal today at 14:00.' })[definition.category], taskTitle: 'Review project proposal', priority: 'High', dueDate: '12 Nov 2026', amount: '2,500', remainingAmount: '2,500', currency: 'DZD', personName: 'Ahmed', billName: 'Internet', subscriptionName: 'Orbit Plus', renewalDate: '12 Nov 2026', goalTitle: 'Learn French', progressPercent: '65', targetDate: '31 Dec 2026', eventName: 'Algiers Tech Meetup', eventDate: '12 Nov 2026', venue: 'Algiers', openTasks: '3', overdueTasks: '1', netAmount: '12,500', completedCount: '2', totalCount: '3', taskCount: '3', taskList: 'Review project proposal\nSend invoice\nPrepare for your exam' };
  const row = req.body.content || await getAutomaticTemplate(definition.key);
  if (req.body.content) validateAutomaticContent(definition.key, row.variants, row.buttons);
  return success(res, renderAutomaticContent(row, req.body.language, examples, { preview: true }));
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
