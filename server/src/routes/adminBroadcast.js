import crypto from 'node:crypto';
import mongoose from 'mongoose';
import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { adminAuth, adminRoleGuard } from '../middleware/auth.js';
import { requireAdminCsrf, requireSuperAdmin, verifyFreshAdmin } from '../middleware/adminSecurity.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/api.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { campaignInput, audienceSelection, scheduleInput, testInput, settingsInput, pageInput, audienceFilters } from '../validators/broadcast.js';
import { BroadcastCampaign } from '../models/BroadcastCampaign.js';
import { BroadcastRecipient } from '../models/BroadcastRecipient.js';
import { BroadcastInteraction } from '../models/BroadcastInteraction.js';
import { BroadcastSegment } from '../models/BroadcastSegment.js';
import { BroadcastSettings } from '../models/BroadcastSettings.js';
import { BroadcastLaunchGuard } from '../models/BroadcastLaunchGuard.js';
import { BroadcastDailyQuota } from '../models/BroadcastDailyQuota.js';
import { MessagePreference } from '../models/MessagePreference.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { User } from '../models/User.js';
import { Plan } from '../models/Plan.js';
import { previewAudience, listAudience } from '../services/broadcastAudience.js';
import { broadcastParts } from '../services/broadcastContent.js';
import { broadcastImageExists, loadBroadcastImage, saveBroadcastImage } from '../services/broadcastMedia.js';
import { getBroadcastSettings } from '../jobs/broadcastWorker.js';
import { telegramRequest, sendPhoto } from '../telegram/botClient.js';
import { env } from '../config/env.js';

export const adminBroadcastRoutes = Router();
export const adminAudienceRoutes = Router();
export const adminBroadcastSettingsRoutes = Router();
for (const router of [adminBroadcastRoutes, adminAudienceRoutes, adminBroadcastSettingsRoutes]) {
  router.use(adminAuth, adminRoleGuard('ADMIN', 'SUPER_ADMIN'));
  router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : requireAdminCsrf(req, res, next));
}
const objectId = (id) => { if (!mongoose.isValidObjectId(id)) throw new AppError('Invalid ID', 422); return id; };
const campaignById = async (id) => { const row = await BroadcastCampaign.findById(objectId(id)); if (!row) throw new AppError('Campaign not found', 404); return row; };
const record = (req, event, targetId, metadata = {}) => audit(event, { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'BroadcastCampaign', targetId, metadata, ip: req.ip });
const selectionBody = z.strictObject({ selection: audienceSelection, promotional: z.boolean().default(false) });
const testLimiter = rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 5 });
const launchLimiter = rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 10 });
const mediaLimiter = rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === 'test' ? 1000 : 10 });
async function reserveDailyLaunch(limit) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const expiresAt = new Date(Date.parse(`${day}T00:00:00.000Z`) + 3 * 86400000);
  try {
    const row = await BroadcastDailyQuota.findOneAndUpdate({ day, count: { $lt: limit } }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, new: true });
    return row;
  } catch (error) {
    if (error.code !== 11000) throw error;
    const row = await BroadcastDailyQuota.findOneAndUpdate({ day, count: { $lt: limit } }, { $inc: { count: 1 } }, { new: true });
    if (!row) throw new AppError('Daily campaign limit reached', 429);
    return row;
  }
}

adminAudienceRoutes.get('/plans', asyncHandler(async (_req, res) => success(res, await Plan.find({ status: 'ACTIVE', kind: { $ne: 'FREE' } }).select('name kind').sort({ name: 1 }).lean())));
adminAudienceRoutes.post('/preview', validate(selectionBody), asyncHandler(async (req, res) => success(res, await previewAudience(req.body.selection, { promotional: req.body.promotional }))));
adminAudienceRoutes.post('/users', validate(selectionBody.extend({ page: z.number().int().min(1).default(1), limit: z.number().int().min(1).max(100).default(25) })), asyncHandler(async (req, res) => success(res, await listAudience(req.body.selection, { page: req.body.page, limit: req.body.limit, promotional: req.body.promotional }))));
adminAudienceRoutes.get('/segments', asyncHandler(async (_req, res) => success(res, await BroadcastSegment.find().sort({ updatedAt: -1 }).select('name filters createdBy updatedAt').lean())));
adminAudienceRoutes.post('/segments', validate(z.strictObject({ name: z.string().trim().min(1).max(100), filters: audienceFilters })), asyncHandler(async (req, res) => {
  const segment = await BroadcastSegment.create({ ...req.body, createdBy: req.admin._id });
  await audit('BROADCAST_SEGMENT_CREATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'BroadcastSegment', targetId: segment._id });
  return success(res, segment, 201);
}));
adminAudienceRoutes.delete('/segments/:id', asyncHandler(async (req, res) => {
  const segment = await BroadcastSegment.findOneAndDelete({ _id: objectId(req.params.id), createdBy: req.admin._id });
  if (!segment) throw new AppError('Segment not found', 404);
  await audit('BROADCAST_SEGMENT_DELETED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'BroadcastSegment', targetId: segment._id });
  return success(res, { deleted: true });
}));

adminBroadcastRoutes.post('/media', mediaLimiter, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new AppError('Image body required', 422);
  const id = await saveBroadcastImage(req.body, req.get('Content-Type'));
  await audit('BROADCAST_MEDIA_UPLOADED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'BroadcastMedia', targetId: id });
  return success(res, { imageId: id }, 201);
}));
adminBroadcastRoutes.get('/media/:id', asyncHandler(async (req, res) => { res.type('image/jpeg').set('Cache-Control', 'private, max-age=3600').send(await loadBroadcastImage(req.params.id)); }));
adminBroadcastRoutes.get('/', validate(pageInput, 'query'), asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const [rows, total] = await Promise.all([BroadcastCampaign.find().select('-audience').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), BroadcastCampaign.countDocuments()]);
  return success(res, rows, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
adminBroadcastRoutes.get('/test-recipient', asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.admin.email, status: 'ACTIVE' }).select('_id fullName');
  const linked = user ? Boolean(await TelegramConnection.exists({ user: user._id })) : false;
  return success(res, { userId: linked ? user._id : null, fullName: linked ? user.fullName : null });
}));
adminBroadcastRoutes.post('/', validate(campaignInput), asyncHandler(async (req, res) => {
  if (req.body.imageId && !(await broadcastImageExists(req.body.imageId))) throw new AppError('Image not found', 422);
  const campaign = await BroadcastCampaign.create({ ...req.body, createdBy: req.admin._id });
  await record(req, 'BROADCAST_CREATED', campaign._id);
  return success(res, campaign, 201);
}));
adminBroadcastRoutes.get('/:id', asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  const interactions = await BroadcastInteraction.aggregate([{ $match: { campaign: campaign._id } }, { $group: { _id: '$action', count: { $sum: 1 } } }]);
  return success(res, { ...campaign.toObject(), interactionCounts: Object.fromEntries(interactions.map((item) => [item._id, item.count])) });
}));
adminBroadcastRoutes.put('/:id', validate(campaignInput), asyncHandler(async (req, res) => {
  if (req.body.imageId && !(await broadcastImageExists(req.body.imageId))) throw new AppError('Image not found', 422);
  const campaign = await BroadcastCampaign.findOneAndUpdate({ _id: objectId(req.params.id), status: 'DRAFT' }, { $set: req.body }, { new: true, runValidators: true });
  if (!campaign) throw new AppError('Only drafts can be edited', 409);
  await record(req, 'BROADCAST_EDITED', campaign._id);
  return success(res, campaign);
}));
adminBroadcastRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const campaign = await BroadcastCampaign.findOneAndDelete({ _id: objectId(req.params.id), status: 'DRAFT' });
  if (!campaign) throw new AppError('Only drafts can be deleted', 409);
  await record(req, 'BROADCAST_DELETED', campaign._id);
  return success(res, { deleted: true });
}));
adminBroadcastRoutes.post('/:id/duplicate', asyncHandler(async (req, res) => {
  const source = await campaignById(req.params.id);
  const campaign = await BroadcastCampaign.create({ name: `${source.name} copy`, description: source.description, category: source.category, channel: source.channel, variants: source.variants, imageId: source.imageId, buttons: source.buttons, audience: source.audience, createdBy: req.admin._id });
  await record(req, 'BROADCAST_DUPLICATED', campaign._id, { source: source._id });
  return success(res, campaign, 201);
}));
adminBroadcastRoutes.get('/:id/audience', asyncHandler(async (req, res) => { const campaign = await campaignById(req.params.id); return success(res, await previewAudience(campaign.audience, { promotional: campaign.category !== 'IMPORTANT_NOTICE' })); }));
adminBroadcastRoutes.post('/:id/preview', validate(z.strictObject({ language: z.enum(['en', 'ar']).default('en') })), asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  return success(res, broadcastParts(campaign, req.body.language, { firstName: 'Alex', fullName: 'Alex Example', planName: 'Orbit Plus', expiryDate: '31 Dec 2026' }));
}));
adminBroadcastRoutes.post('/:id/test', testLimiter, validate(testInput), asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  const recipient = await User.findById(req.body.recipientUserId).select('email status');
  if (!recipient || recipient.status !== 'ACTIVE' || recipient.email !== req.admin.email) throw new AppError('Test recipient must be your active linked user account', 403);
  const connection = await TelegramConnection.findOne({ user: recipient._id });
  if (!connection) throw new AppError('Your user account is not linked to Telegram', 422);
  const parts = broadcastParts(campaign, req.body.language, { firstName: req.admin.fullName.split(/\s+/)[0], fullName: req.admin.fullName, planName: 'Test plan', expiryDate: '31 Dec 2026' });
  const messageIds = [];
  if (parts.photo) { const result = await sendPhoto(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, await loadBroadcastImage(campaign.imageId), 'image/jpeg', parts.photo.caption, parts.photo.keyboard); messageIds.push(result.message_id); }
  if (parts.text) { const result = await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: connection.chatId, text: parts.text.text, parse_mode: 'HTML', ...(parts.text.keyboard ? { reply_markup: parts.text.keyboard } : {}) }); messageIds.push(result.message_id); }
  await record(req, 'BROADCAST_TEST_SENT', campaign._id, { recipientUserId: recipient._id });
  return success(res, { messageIds });
}));
adminBroadcastRoutes.post('/:id/launch', launchLimiter, requireSuperAdmin, validate(scheduleInput), verifyFreshAdmin, asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  if (campaign.status !== 'DRAFT') throw new AppError('Campaign has already been launched', 409);
  const settings = await getBroadcastSettings();
  if (!settings.enabled) throw new AppError('Broadcast delivery is disabled', 409);
  if (!env.ORBIT_TELEGRAM_BOT_TOKEN) throw new AppError('Telegram bot is not configured', 409);
  const schedule = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;
  if (schedule && schedule <= new Date()) throw new AppError('Choose a future delivery time', 422);
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ variants: campaign.variants, imageId: campaign.imageId, buttons: campaign.buttons, audience: campaign.audience })).digest('hex');
  let guard = false;
  let quota = null;
  let launched;
  try {
    if (settings.duplicateWindowHours) {
      try { await BroadcastLaunchGuard.findOneAndUpdate({ fingerprint, expiresAt: { $lte: new Date() } }, { $set: { campaign: campaign._id, expiresAt: new Date(Date.now() + settings.duplicateWindowHours * 3600000) } }, { upsert: true, new: true }); guard = true; }
      catch (error) { if (error.code === 11000) throw new AppError('An equivalent campaign was launched recently', 409); throw error; }
    }
    quota = await reserveDailyLaunch(settings.dailyCampaignLimit);
    launched = await BroadcastCampaign.findOneAndUpdate({ _id: campaign._id, status: 'DRAFT' }, { $set: { status: 'PREPARING', scheduledAt: schedule, launchedBy: req.admin._id, launchedAt: new Date(), contentFingerprint: fingerprint } }, { new: true });
    if (!launched) throw new AppError('Campaign has already been launched', 409);
  } catch (error) {
    if (quota) await BroadcastDailyQuota.updateOne({ _id: quota._id, count: { $gt: 0 } }, { $inc: { count: -1 } });
    if (guard) await BroadcastLaunchGuard.deleteOne({ fingerprint, campaign: campaign._id });
    throw error;
  }
  await record(req, 'BROADCAST_LAUNCHED', campaign._id, { scheduledAt: schedule });
  return success(res, launched);
}));
adminBroadcastRoutes.post('/:id/pause', requireSuperAdmin, asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  if (!['PREPARING', 'SCHEDULED', 'SENDING'].includes(campaign.status)) throw new AppError('Campaign cannot be paused', 409);
  const row = await BroadcastCampaign.findOneAndUpdate({ _id: campaign._id, status: campaign.status }, { $set: { status: 'PAUSED', pausedFrom: campaign.status } }, { new: true });
  if (!row) throw new AppError('Campaign changed; retry', 409);
  await record(req, 'BROADCAST_PAUSED', row._id); return success(res, row);
}));
adminBroadcastRoutes.post('/:id/resume', requireSuperAdmin, asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  if (campaign.status !== 'PAUSED') throw new AppError('Campaign is not paused', 409);
  const status = !campaign.snapshotCompletedAt ? 'PREPARING' : campaign.scheduledAt && campaign.scheduledAt > new Date() ? 'SCHEDULED' : 'SENDING';
  const row = await BroadcastCampaign.findOneAndUpdate({ _id: campaign._id, status: 'PAUSED' }, { $set: { status, pausedFrom: null } }, { new: true });
  await record(req, 'BROADCAST_RESUMED', row._id); return success(res, row);
}));
adminBroadcastRoutes.post('/:id/cancel', requireSuperAdmin, asyncHandler(async (req, res) => {
  const row = await BroadcastCampaign.findOneAndUpdate({ _id: objectId(req.params.id), status: { $in: ['PREPARING', 'SCHEDULED', 'SENDING', 'PAUSED'] } }, { $set: { status: 'CANCELLED', finishedAt: new Date() } }, { new: true });
  if (!row) throw new AppError('Campaign cannot be cancelled', 409);
  await BroadcastRecipient.updateMany({ campaign: row._id, status: { $in: ['PENDING', 'RETRYING'] } }, { $set: { status: 'SKIPPED', skippedReason: 'CAMPAIGN_CANCELLED' } });
  await record(req, 'BROADCAST_CANCELLED', row._id); return success(res, row);
}));
adminBroadcastRoutes.get('/:id/recipients', validate(pageInput, 'query'), asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  const { page, limit } = req.query;
  const [rows, total, counts, errors] = await Promise.all([
    BroadcastRecipient.find({ campaign: campaign._id }).select('-chatId').populate('user', 'fullName email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    BroadcastRecipient.countDocuments({ campaign: campaign._id }),
    BroadcastRecipient.aggregate([{ $match: { campaign: campaign._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    BroadcastRecipient.aggregate([{ $match: { campaign: campaign._id, status: 'FAILED' } }, { $group: { _id: '$lastError.code', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
  ]);
  return success(res, { rows, counts: Object.fromEntries(counts.map((item) => [item._id, item.count])), errors: errors.map((item) => ({ code: item._id || 'UNKNOWN', count: item.count })) }, 200, { pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
adminBroadcastRoutes.post('/:id/retry', requireSuperAdmin, asyncHandler(async (req, res) => {
  const campaign = await campaignById(req.params.id);
  if (campaign.status === 'FAILED' && !campaign.snapshotCompletedAt) {
    await BroadcastCampaign.updateOne({ _id: campaign._id, status: 'FAILED' }, { $set: { status: 'PREPARING', lastError: null, snapshotClaimUntil: null, snapshotBy: null } });
    await record(req, 'BROADCAST_RETRIED', campaign._id, { snapshot: true });
    return success(res, { queued: 0, snapshot: true });
  }
  if (!['COMPLETED', 'SENDING', 'FAILED'].includes(campaign.status)) throw new AppError('Campaign is not retryable', 409);
  const result = await BroadcastRecipient.updateMany({ campaign: campaign._id, status: 'FAILED', 'lastError.code': { $ne: 'AMBIGUOUS' } }, { $set: { status: 'RETRYING', nextAttemptAt: new Date(), lastError: null } });
  if (result.modifiedCount) await BroadcastCampaign.updateOne({ _id: campaign._id, status: { $in: ['COMPLETED', 'FAILED'] } }, { $set: { status: 'SENDING', finishedAt: null } });
  await record(req, 'BROADCAST_RETRIED', campaign._id, { count: result.modifiedCount });
  return success(res, { queued: result.modifiedCount });
}));

adminBroadcastSettingsRoutes.get('/', asyncHandler(async (_req, res) => { const value = (await getBroadcastSettings()).toObject(); delete value.nextSlotAt; return success(res, value); }));
adminBroadcastSettingsRoutes.put('/', requireSuperAdmin, validate(settingsInput), asyncHandler(async (req, res) => {
  const value = await BroadcastSettings.findOneAndUpdate({ key: 'global' }, { $set: req.body }, { upsert: true, new: true, runValidators: true });
  await audit('BROADCAST_SETTINGS_UPDATED', { actorType: 'ADMIN', actorId: req.admin._id, targetType: 'BroadcastSettings', targetId: value._id, metadata: req.body });
  return success(res, value);
}));

export const messagePreferenceRoutes = Router();
messagePreferenceRoutes.get('/', asyncHandler(async (req, res) => { const value = await MessagePreference.findOne({ user: req.user._id }); return success(res, { promotionalTelegram: Boolean(value?.promotionalTelegram), consentAt: value?.consentAt, optOutAt: value?.optOutAt }); }));
messagePreferenceRoutes.put('/', validate(z.strictObject({ promotionalTelegram: z.boolean() })), asyncHandler(async (req, res) => {
  const allowed = req.body.promotionalTelegram;
  const value = await MessagePreference.findOneAndUpdate({ user: req.user._id }, { $set: { promotionalTelegram: allowed, ...(allowed ? { consentAt: new Date(), optOutAt: null } : { optOutAt: new Date() }) } }, { upsert: true, new: true });
  await audit('MESSAGE_PREFERENCE_UPDATED', { actorType: 'USER', actorId: req.user._id, targetType: 'MessagePreference', targetId: value._id, metadata: { promotionalTelegram: allowed } });
  return success(res, { promotionalTelegram: value.promotionalTelegram, consentAt: value.consentAt, optOutAt: value.optOutAt });
}));
