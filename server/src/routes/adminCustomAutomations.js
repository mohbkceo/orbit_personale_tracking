import mongoose from 'mongoose';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { requireAdminCsrf, requireSuperAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { success } from '../utils/api.js';
import { customAutomationInput } from '../validators/customAutomation.js';
import { CustomAutomation, AutomationExecution } from '../models/CustomAutomation.js';
import { User } from '../models/User.js';
import { automationPreview, validateAutomationReferences } from '../services/customAutomations.js';
import { broadcastImageExists, loadBroadcastImage } from '../services/broadcastMedia.js';
import { adminTelegramRecipient } from '../services/adminTelegramPolicy.js';
import { audit } from '../services/auditService.js';
import { telegramRequest, sendPhoto } from '../telegram/botClient.js';
import { env } from '../config/env.js';

export const adminCustomAutomationRoutes = Router();
const router = adminCustomAutomationRoutes;
router.use(adminAuth, adminRoleGuard('ADMIN', 'SUPER_ADMIN'));
router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : requireAdminCsrf(req, res, next));
router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : requireSuperAdmin(req, res, next));
const id = (value) => { if (!mongoose.isValidObjectId(value)) throw new AppError('Invalid automation ID', 422); return value; };
const record = (req, event, targetId) => audit(event, { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'CustomAutomation', targetId });
async function references(input) {
  if (!await validateAutomationReferences(input)) throw new AppError('Choose active paid plans', 422);
  for (const message of input.messages) if (message.imageId && !await broadcastImageExists(message.imageId)) throw new AppError('Image not found', 422);
}
function futureSchedule(input) {
  if (input.enabled && input.trigger.type === 'SCHEDULED' && new Date(input.trigger.configuration.scheduledAt) <= new Date()) throw new AppError('Choose a future scheduled time', 422);
}
router.get('/', asyncHandler(async (_req, res) => success(res, await CustomAutomation.find().sort({ createdAt: -1 }).lean())));
const previewInput = z.strictObject({ automation: customAutomationInput, messageIndex: z.number().int().min(0).max(19).default(0) }).refine((input) => input.messageIndex < input.automation.messages.length, 'Choose a message');
router.post('/preview', validate(previewInput), asyncHandler(async (req, res) => success(res, automationPreview(req.body.automation, req.body.messageIndex))));
router.post('/test', rateLimit({ windowMs: 60000, limit: env.NODE_ENV === 'test' ? 1000 : 5 }), validate(previewInput), asyncHandler(async (req, res) => {
  await references(req.body.automation);
  const user = await User.findOne({ email: req.admin.email, status: 'ACTIVE' });
  const recipient = user && await adminTelegramRecipient(user._id);
  if (!recipient) throw new AppError('Link the user account matching your admin email to Telegram first', 422);
  const parts = automationPreview(req.body.automation, req.body.messageIndex);
  const message = req.body.automation.messages[req.body.messageIndex];
  if (parts.photo) await sendPhoto(env.ORBIT_TELEGRAM_BOT_TOKEN, recipient.connection.chatId, await loadBroadcastImage(message.imageId), 'image/jpeg', parts.photo.caption, parts.photo.keyboard);
  if (parts.text) await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: recipient.connection.chatId, text: parts.text.text, parse_mode: 'HTML', ...(parts.text.keyboard ? { reply_markup: parts.text.keyboard } : {}) });
  await record(req, 'CUSTOM_AUTOMATION_TEST_SENT', user._id);
  return success(res, { sent: true });
}));
router.post('/', validate(customAutomationInput), asyncHandler(async (req, res) => {
  await references(req.body); futureSchedule(req.body);
  const automation = await CustomAutomation.create({ ...req.body, createdBy: req.admin._id, enabledAt: req.body.enabled ? new Date() : null });
  await record(req, 'CUSTOM_AUTOMATION_CREATED', automation._id);
  return success(res, automation, 201);
}));
router.put('/:id', validate(customAutomationInput), asyncHandler(async (req, res) => {
  await references(req.body); futureSchedule(req.body);
  const automation = await CustomAutomation.findOneAndUpdate({ _id: id(req.params.id) }, { $set: { ...req.body, enabledAt: req.body.enabled ? new Date() : null }, $inc: { revision: 1 } }, { new: true, runValidators: true });
  if (!automation) throw new AppError('Automation not found', 404);
  await AutomationExecution.updateMany({ automation: automation._id, revision: { $lt: automation.revision }, status: { $in: ['PENDING', 'RETRYING'] } }, { $set: { status: 'CANCELLED', lastError: 'Automation edited or disabled' } });
  await record(req, 'CUSTOM_AUTOMATION_UPDATED', automation._id);
  return success(res, automation);
}));
router.patch('/:id/enabled', validate(z.strictObject({ enabled: z.boolean() })), asyncHandler(async (req, res) => {
  const current = await CustomAutomation.findById(id(req.params.id));
  if (!current) throw new AppError('Automation not found', 404);
  if (current.enabled === req.body.enabled) return success(res, current);
  if (req.body.enabled) { await references(current); futureSchedule({ ...current.toObject(), enabled: true }); }
  const automation = await CustomAutomation.findOneAndUpdate({ _id: current._id, revision: current.revision }, { $set: { enabled: req.body.enabled, enabledAt: req.body.enabled ? new Date() : null }, $inc: { revision: 1 } }, { new: true });
  if (!automation) throw new AppError('Automation changed; reload and try again', 409);
  await AutomationExecution.updateMany({ automation: current._id, revision: { $lt: automation.revision }, status: { $in: ['PENDING', 'RETRYING'] } }, { $set: { status: 'CANCELLED', lastError: 'Automation disabled' } });
  await record(req, req.body.enabled ? 'CUSTOM_AUTOMATION_ENABLED' : 'CUSTOM_AUTOMATION_DISABLED', automation._id);
  return success(res, automation);
}));
router.get('/:id/executions', asyncHandler(async (req, res) => {
  const rows = await AutomationExecution.find({ automation: id(req.params.id) }).sort({ createdAt: -1 }).limit(100).select('user messageIndex scheduledAt status attempts sentAt lastError').lean();
  return success(res, rows);
}));
