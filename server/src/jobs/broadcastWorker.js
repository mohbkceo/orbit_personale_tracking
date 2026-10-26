import crypto from 'node:crypto';
import { BroadcastCampaign } from '../models/BroadcastCampaign.js';
import { BroadcastRecipient } from '../models/BroadcastRecipient.js';
import { BroadcastSettings } from '../models/BroadcastSettings.js';
import { BroadcastWorkerSlot } from '../models/BroadcastWorkerSlot.js';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { MessagePreference } from '../models/MessagePreference.js';
import { Plan } from '../models/Plan.js';
import { Setting } from '../models/Setting.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { previewAudience, recipientSnapshot } from '../services/broadcastAudience.js';
import { broadcastParts } from '../services/broadcastContent.js';
import { loadBroadcastImage } from '../services/broadcastMedia.js';
import { env } from '../config/env.js';
import { telegramRequest, sendPhoto } from '../telegram/botClient.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc); dayjs.extend(timezone);

const workerId = crypto.randomUUID();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const promotional = (campaign) => campaign.category !== 'IMPORTANT_NOTICE';
const inWindow = (clock, start, end) => start < end ? clock >= start && clock < end : clock >= start || clock < end;
const sanitizedError = (error) => ({ code: String(error.telegramCode || error.code || 'DELIVERY_ERROR').slice(0, 40), message: String(error.message || 'Delivery failed').replace(/bot\d+:[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300) });

export async function getBroadcastSettings() {
  try { return await BroadcastSettings.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    return BroadcastSettings.findOne({ key: 'global' });
  }
}
async function reserveGlobalSlot(rate) {
  const interval = Math.ceil(1000 / rate);
  const now = new Date();
  const settings = await BroadcastSettings.findOneAndUpdate({ key: 'global' }, [
    { $set: { nextSlotAt: { $add: [{ $max: [{ $ifNull: ['$nextSlotAt', now] }, { $ifNull: ['$rateLimitedUntil', now] }, now] }, interval] } } },
  ], { new: true });
  const slotAt = new Date(settings.nextSlotAt).getTime() - interval;
  if (slotAt > Date.now()) await wait(slotAt - Date.now());
}
async function ensureWorkerSlots(count) {
  try { await BroadcastWorkerSlot.bulkWrite(Array.from({ length: count }, (_, slot) => ({ updateOne: { filter: { slot }, update: { $setOnInsert: { slot } }, upsert: true } })), { ordered: false }); }
  catch (error) { if (!(error.code === 11000 || error.writeErrors?.every((item) => item.code === 11000))) throw error; }
}
async function claimWorkerSlot(count, now) {
  const claim = `${workerId}:${crypto.randomUUID()}`;
  const slot = await BroadcastWorkerSlot.findOneAndUpdate({ slot: { $lt: count }, $or: [{ claimUntil: null }, { claimUntil: { $lte: now } }] }, { $set: { claimedBy: claim, claimUntil: new Date(now.getTime() + 120000) } }, { sort: { slot: 1 }, new: true });
  return slot ? { id: slot._id, claim } : null;
}
async function releaseWorkerSlot(slot) {
  await BroadcastWorkerSlot.updateOne({ _id: slot.id, claimedBy: slot.claim }, { $set: { claimedBy: null, claimUntil: null } });
}
async function snapshotCampaign(campaign, now) {
  const claim = await BroadcastCampaign.findOneAndUpdate({ _id: campaign._id, status: 'PREPARING', $or: [{ snapshotClaimUntil: null }, { snapshotClaimUntil: { $lte: now } }] }, { $set: { snapshotBy: workerId, snapshotClaimUntil: new Date(now.getTime() + 30 * 60000), snapshotStartedAt: campaign.snapshotStartedAt || now } }, { new: true });
  if (!claim) return;
  try {
    const totals = await previewAudience(claim.audience, { promotional: promotional(claim), now: claim.snapshotStartedAt });
    let batch = [];
    for await (const recipient of recipientSnapshot(claim.audience, { promotional: promotional(claim), now: claim.snapshotStartedAt })) {
      batch.push({ updateOne: { filter: { campaign: claim._id, user: recipient._id }, update: { $setOnInsert: { campaign: claim._id, user: recipient._id, chatId: recipient.chatId, scheduledAt: claim.scheduledAt || now, status: 'PENDING' } }, upsert: true } });
      if (batch.length >= 100) {
        await BroadcastRecipient.bulkWrite(batch, { ordered: false }); batch = [];
        const renewed = await BroadcastCampaign.updateOne({ _id: claim._id, status: 'PREPARING', snapshotBy: workerId }, { $set: { snapshotClaimUntil: new Date(Date.now() + 30 * 60000) } });
        if (!renewed.matchedCount) throw new Error('Snapshot ownership was lost');
      }
    }
    if (batch.length) await BroadcastRecipient.bulkWrite(batch, { ordered: false });
    const count = await BroadcastRecipient.countDocuments({ campaign: claim._id });
    await BroadcastCampaign.updateOne({ _id: claim._id, status: 'PREPARING', snapshotBy: workerId }, { $set: { snapshotCompletedAt: new Date(), snapshotClaimUntil: null, snapshotBy: null, status: claim.scheduledAt && claim.scheduledAt > new Date() ? 'SCHEDULED' : 'SENDING', startedAt: claim.scheduledAt && claim.scheduledAt > new Date() ? null : new Date(), stats: { targeted: totals.targeted, eligible: count, skipped: 0, sent: 0, failed: 0 } } });
  } catch (error) {
    await BroadcastCampaign.updateOne({ _id: claim._id, status: 'PREPARING', snapshotBy: workerId }, { $set: { status: 'FAILED', snapshotClaimUntil: null, snapshotBy: null, lastError: sanitizedError(error).message } });
    throw error;
  }
}
async function resolveVariables(user) {
  const [subscription, settings] = await Promise.all([
    AccessSubscription.findOne({ user: user._id, status: { $in: ['ACTIVE', null] }, expiresAt: { $gt: new Date() } }).sort({ expiresAt: -1, createdAt: -1 }).lean(),
    Setting.findOne({ user: user._id }).select('language timezone reminders.quietHours').lean(),
  ]);
  const plan = subscription ? await Plan.findById(subscription.plan).select('name').lean() : null;
  return { language: settings?.language === 'ar' ? 'ar' : 'en', quiet: settings?.reminders?.quietHours, timezone: settings?.timezone || 'UTC', values: { firstName: user.fullName.split(/\s+/)[0], fullName: user.fullName, planName: plan?.name || 'Free', expiryDate: subscription?.expiresAt ? new Intl.DateTimeFormat(settings?.language === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }).format(subscription.expiresAt) : '—' } };
}
async function markSkipped(recipient, reason) {
  await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { status: 'SKIPPED', skippedReason: reason, claimUntil: null, claimedBy: null }, $push: { attemptLog: { at: new Date(), outcome: 'SKIPPED', code: reason } } });
}
async function deliverRecipient(recipient, campaign, settings) {
  const [user, connection, preference, currentCampaign] = await Promise.all([
    User.findById(recipient.user).select('fullName status'), TelegramConnection.findOne({ user: recipient.user }).select('chatId'),
    MessagePreference.findOne({ user: recipient.user }).select('promotionalTelegram'), BroadcastCampaign.findById(campaign._id).select('status'),
  ]);
  if (currentCampaign?.status === 'PAUSED') {
    await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { status: 'RETRYING', nextAttemptAt: new Date(Date.now() + 10000), claimUntil: null, claimedBy: null } });
    return;
  }
  if (currentCampaign?.status !== 'SENDING') return markSkipped(recipient, 'CAMPAIGN_STOPPED');
  if (!user || user.status !== 'ACTIVE' || !connection || connection.chatId !== recipient.chatId || (promotional(campaign) && !preference?.promotionalTelegram)) return markSkipped(recipient, 'NO_LONGER_ELIGIBLE');
  const { language, values, quiet, timezone: zone } = await resolveVariables(user);
  if (settings.quietHours && quiet?.enabled && inWindow(dayjs().tz(zone).format('HH:mm'), quiet.start || '22:00', quiet.end || '08:00')) {
    await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { status: 'RETRYING', nextAttemptAt: new Date(Date.now() + 15 * 60000), claimUntil: null, claimedBy: null }, $inc: { attempts: -1 } });
    return;
  }
  const parts = broadcastParts(campaign, language, values);
  try {
    if (parts.photo && recipient.parts?.photo?.status !== 'SENT') {
      await reserveGlobalSlot(settings.requestsPerSecond);
      const fresh = await BroadcastCampaign.findById(campaign._id).select('status +photoFileId');
      if (fresh?.status !== 'SENDING') throw Object.assign(new Error('Campaign paused'), { code: 'CAMPAIGN_PAUSED' });
      const photoBody = { chat_id: recipient.chatId, photo: fresh.photoFileId, ...(parts.photo.caption ? { caption: parts.photo.caption, parse_mode: 'HTML' } : {}), ...(parts.photo.keyboard ? { reply_markup: parts.photo.keyboard } : {}) };
      let result;
      if (fresh.photoFileId && /^[A-Za-z0-9_-]{10,300}$/.test(fresh.photoFileId)) {
        try { result = await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'sendPhoto', photoBody); }
        catch (error) { if (Number(error.telegramCode) !== 400) throw error; await BroadcastCampaign.updateOne({ _id: campaign._id }, { $unset: { photoFileId: '' } }); await reserveGlobalSlot(settings.requestsPerSecond); }
      }
      if (!result) result = await sendPhoto(env.ORBIT_TELEGRAM_BOT_TOKEN, recipient.chatId, await loadBroadcastImage(campaign.imageId), 'image/jpeg', parts.photo.caption, parts.photo.keyboard);
      const candidate = result.photo?.at(-1)?.file_id;
      if (candidate && /^[A-Za-z0-9_-]{10,300}$/.test(candidate)) await BroadcastCampaign.updateOne({ _id: campaign._id, photoFileId: { $exists: false } }, { $set: { photoFileId: candidate } });
      await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { 'parts.photo': { status: 'SENT', messageId: result.message_id, sentAt: new Date() } } });
    }
    if (parts.text && recipient.parts?.text?.status !== 'SENT') {
      await reserveGlobalSlot(settings.requestsPerSecond);
      const fresh = await BroadcastCampaign.findById(campaign._id).select('status');
      if (fresh?.status !== 'SENDING') throw Object.assign(new Error('Campaign paused'), { code: 'CAMPAIGN_PAUSED' });
      if (parts.photo) {
        const [latestUser, latestConnection, latestPreference] = await Promise.all([User.findById(recipient.user).select('status'), TelegramConnection.findOne({ user: recipient.user }).select('chatId'), MessagePreference.findOne({ user: recipient.user }).select('promotionalTelegram')]);
        if (latestUser?.status !== 'ACTIVE' || latestConnection?.chatId !== recipient.chatId || promotional(campaign) && !latestPreference?.promotionalTelegram) return markSkipped(recipient, 'NO_LONGER_ELIGIBLE');
      }
      const result = await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: recipient.chatId, text: parts.text.text, parse_mode: 'HTML', ...(parts.text.keyboard ? { reply_markup: parts.text.keyboard } : {}) });
      await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { 'parts.text': { status: 'SENT', messageId: result.message_id, sentAt: new Date() } } });
    }
    await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { status: 'SENT', sentAt: new Date(), claimUntil: null, claimedBy: null, lastError: null }, $push: { attemptLog: { at: new Date(), outcome: 'SENT' } } });
  } catch (error) {
    const info = sanitizedError(error);
    if (Number(error.telegramCode) === 429 && error.retryAfter) await BroadcastSettings.updateOne({ key: 'global' }, { $max: { rateLimitedUntil: new Date(Date.now() + error.retryAfter * 1000) } });
    const retryable = info.code === 'CAMPAIGN_PAUSED' || Number(error.telegramCode) === 429 || Number(error.telegramCode) >= 500 || !error.telegramCode;
    const retry = retryable && recipient.attempts < settings.maxAttempts;
    const seconds = error.retryAfter ? Math.max(error.retryAfter, settings.retryDelaySeconds) : settings.retryDelaySeconds * 2 ** Math.max(0, recipient.attempts - 1);
    await BroadcastRecipient.updateOne({ _id: recipient._id, claimedBy: workerId }, { $set: { status: retry ? 'RETRYING' : 'FAILED', nextAttemptAt: retry ? new Date(Date.now() + Math.min(seconds, 86400) * 1000) : null, claimUntil: null, claimedBy: null, lastError: info }, $push: { attemptLog: { at: new Date(), outcome: retry ? 'RETRYING' : 'FAILED', code: info.code } } });
  }
}
async function finishCampaign(campaign) {
  const [pending, sent, failed, skipped] = await Promise.all(['PENDING', 'SENT', 'FAILED', 'SKIPPED'].map((status) => BroadcastRecipient.countDocuments({ campaign: campaign._id, status })));
  const active = await BroadcastRecipient.countDocuments({ campaign: campaign._id, status: { $in: ['PROCESSING', 'RETRYING'] } });
  await BroadcastCampaign.updateOne({ _id: campaign._id, status: 'SENDING' }, { $set: { 'stats.sent': sent, 'stats.failed': failed, 'stats.skipped': skipped, ...(pending + active === 0 ? { status: failed > 0 && sent === 0 ? 'FAILED' : 'COMPLETED', finishedAt: new Date() } : {}) } });
}
export async function processBroadcastsOnce() {
  const settings = await getBroadcastSettings();
  if (!settings.enabled || !env.ORBIT_TELEGRAM_BOT_TOKEN) return 0;
  const now = new Date();
  await BroadcastRecipient.updateMany({ status: 'PROCESSING', claimUntil: { $lte: now } }, { $set: { status: 'FAILED', claimUntil: null, claimedBy: null, lastError: { code: 'AMBIGUOUS', message: 'Lease expired during Telegram delivery; inspect before retrying' } } });
  const preparing = await BroadcastCampaign.find({ status: 'PREPARING' }).sort({ createdAt: 1 }).limit(2);
  for (const campaign of preparing) await snapshotCampaign(campaign, now);
  await BroadcastCampaign.updateMany({ status: 'SCHEDULED', scheduledAt: { $lte: now } }, { $set: { status: 'SENDING', startedAt: now } });
  if (!inWindow(now.toISOString().slice(11, 16), settings.deliveryStart, settings.deliveryEnd)) return 0;
  const campaigns = await BroadcastCampaign.find({ status: 'SENDING' }).sort({ workerVisitedAt: 1, startedAt: 1 }).limit(10);
  await ensureWorkerSlots(settings.concurrency);
  let processed = 0;
  for (const campaign of campaigns) {
    await BroadcastCampaign.updateOne({ _id: campaign._id, status: 'SENDING' }, { $set: { workerVisitedAt: new Date() } });
    const claimed = [];
    for (let i = 0; i < settings.concurrency && processed + claimed.length < settings.batchSize; i += 1) {
      const slot = await claimWorkerSlot(settings.concurrency, new Date());
      if (!slot) break;
      const recipient = await BroadcastRecipient.findOneAndUpdate({ campaign: campaign._id, status: { $in: ['PENDING', 'RETRYING'] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }] }, { $set: { status: 'PROCESSING', claimedBy: workerId, claimUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true });
      if (!recipient) { await releaseWorkerSlot(slot); break; }
      claimed.push({ recipient, slot });
    }
    await Promise.all(claimed.map(async ({ recipient, slot }) => { try { await deliverRecipient(recipient, campaign, settings); } finally { await releaseWorkerSlot(slot); } }));
    processed += claimed.length;
    await finishCampaign(campaign);
    if (processed >= settings.batchSize) break;
  }
  return processed;
}
export function startBroadcastWorker() {
  let running = false;
  const timer = setInterval(async () => { if (running) return; running = true; try { await processBroadcastsOnce(); } catch (error) { console.error('Broadcast worker error:', sanitizedError(error)); } finally { running = false; } }, 2000);
  return () => clearInterval(timer);
}
