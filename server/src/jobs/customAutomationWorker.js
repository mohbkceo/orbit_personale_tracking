import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { CustomAutomation, AutomationExecution } from '../models/CustomAutomation.js';
import { automationCampaign, eligibleExecution, scheduleAutomation } from '../services/customAutomations.js';
import { broadcastParts } from '../services/broadcastContent.js';
import { loadBroadcastImage } from '../services/broadcastMedia.js';
import { recordTelegramFailure } from '../services/adminTelegramPolicy.js';
import { getBroadcastSettings, reserveGlobalSlot, resolveVariables, ensureWorkerSlots, claimWorkerSlot, releaseWorkerSlot } from './broadcastWorker.js';
import { BroadcastSettings } from '../models/BroadcastSettings.js';
import { Plan } from '../models/Plan.js';
import { sendPhoto, telegramRequest } from '../telegram/botClient.js';
import { env } from '../config/env.js';

const inWindow = (clock, start, end) => start < end ? clock >= start && clock < end : clock >= start || clock < end;
const cleanError = (error) => String(error.message || 'Delivery failed').replace(/bot\d+:[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 300);

async function deliver(execution, settings, now) {
  const owner = { _id: execution._id, status: 'PROCESSING', claimedBy: execution.claimedBy };
  const finish = (status, extra = {}) => AutomationExecution.updateOne(owner, { $set: { status, claimedBy: null, claimUntil: null, ...extra } });
  let requestStarted = false;
  try {
    let automation = await CustomAutomation.findById(execution.automation).lean();
    const eligible = await eligibleExecution(automation, execution, now);
    if (!eligible) return finish(automation?.enabled ? 'SKIPPED' : 'CANCELLED', { lastError: 'No longer eligible' });
    const earlier = await AutomationExecution.exists({ automation: execution.automation, user: execution.user, sourceEventId: execution.sourceEventId,
      status: { $in: ['PENDING', 'PROCESSING', 'RETRYING'] }, $or: [{ scheduledAt: { $lt: execution.scheduledAt } }, { scheduledAt: execution.scheduledAt, messageIndex: { $lt: execution.messageIndex } }] });
    if (earlier) {
      await AutomationExecution.updateOne(owner, { $inc: { attempts: -1 } });
      return finish('RETRYING', { nextAttemptAt: new Date(now.getTime() + 10000) });
    }
    const context = await resolveVariables(eligible.user);
    if (eligible.subscription) {
      const sourcePlan = await Plan.findById(eligible.subscription.plan).select('name').lean();
      context.values.planName = eligible.subscription.planSnapshot?.name || sourcePlan?.name || context.values.planName;
      context.values.expiryDate = new Intl.DateTimeFormat(context.language, { dateStyle: 'medium', timeZone: context.timezone }).format(eligible.subscription.expiresAt);
    }
    const quiet = context.quiet;
    if (settings.quietHours && quiet?.enabled && inWindow(dayjs(now).tz(context.timezone).format('HH:mm'), quiet.start || '22:00', quiet.end || '08:00')) {
      await AutomationExecution.updateOne(owner, { $inc: { attempts: -1 } });
      return finish('RETRYING', { nextAttemptAt: new Date(now.getTime() + 15 * 60000) });
    }
    const chatId = eligible.connection.chatId;
    execution.chatId = chatId;
    await AutomationExecution.updateOne(owner, { $set: { chatId } });
    const message = automationCampaign(automation, execution.messageIndex);
    const parts = broadcastParts(message, context.language, context.values);
    async function beforeSend() {
      await reserveGlobalSlot(settings.requestsPerSecond);
      const ownsLease = await AutomationExecution.findOneAndUpdate({ ...owner, claimUntil: { $gt: new Date() } }, { $set: { claimUntil: new Date(Date.now() + 120000) } });
      if (!ownsLease) return false;
      automation = await CustomAutomation.findById(execution.automation).lean();
      return Boolean(await eligibleExecution(automation, execution, new Date()));
    }
    if (parts.photo && !execution.photoSentAt) {
      const bytes = await loadBroadcastImage(message.imageId);
      if (!await beforeSend()) return finish('CANCELLED', { lastError: 'No longer eligible' });
      requestStarted = true;
      await sendPhoto(env.ORBIT_TELEGRAM_BOT_TOKEN, chatId, bytes, 'image/jpeg', parts.photo.caption, parts.photo.keyboard);
      await AutomationExecution.updateOne(owner, { $set: { photoSentAt: new Date() } });
      requestStarted = false;
    }
    if (parts.text && !execution.textSentAt) {
      if (!await beforeSend()) return finish('CANCELLED', { lastError: 'No longer eligible' });
      requestStarted = true;
      await telegramRequest(env.ORBIT_TELEGRAM_BOT_TOKEN, 'sendMessage', { chat_id: chatId, text: parts.text.text, parse_mode: 'HTML', ...(parts.text.keyboard ? { reply_markup: parts.text.keyboard } : {}) });
      await AutomationExecution.updateOne(owner, { $set: { textSentAt: new Date() } });
      requestStarted = false;
    }
    return finish('SENT', { sentAt: new Date(), lastError: null });
  } catch (error) {
    await recordTelegramFailure(execution.user, execution.chatId, error);
    const code = Number(error.telegramCode);
    const ambiguous = requestStarted && !code;
    const retry = !ambiguous && (!code || code === 429 || code >= 500) && execution.attempts < settings.maxAttempts;
    const seconds = Math.max(error.retryAfter || 0, settings.retryDelaySeconds * 2 ** (execution.attempts - 1));
    if (code === 429) await BroadcastSettings.updateOne({ key: 'global' }, { $max: { rateLimitedUntil: new Date(Date.now() + seconds * 1000) } });
    return finish(retry ? 'RETRYING' : 'FAILED', { lastError: ambiguous ? 'AMBIGUOUS: Telegram outcome unknown; not retried automatically' : cleanError(error), nextAttemptAt: retry ? new Date(Date.now() + Math.min(seconds, 86400) * 1000) : null });
  }
}

export async function processCustomAutomationsOnce(now = new Date()) {
  const settings = await getBroadcastSettings();
  if (!settings.enabled || !env.ORBIT_TELEGRAM_BOT_TOKEN) return 0;
  // Telegram has no send idempotency key. An interrupted in-flight request must
  // be surfaced for review instead of blindly sending the same message again.
  await AutomationExecution.updateMany({ status: 'PROCESSING', claimUntil: { $lte: now } }, { $set: { status: 'FAILED', claimUntil: null, claimedBy: null, lastError: 'AMBIGUOUS: worker stopped during delivery; not retried automatically' } });
  const automations = CustomAutomation.find({ enabled: true }).lean().cursor();
  for await (const automation of automations) await scheduleAutomation(automation, now);
  if (!inWindow(now.toISOString().slice(11, 16), settings.deliveryStart, settings.deliveryEnd)) return 0;
  await ensureWorkerSlots(settings.concurrency);
  let processed = 0;
  while (processed < settings.batchSize) {
    const slot = await claimWorkerSlot(settings.concurrency, new Date());
    if (!slot) break;
    const execution = await AutomationExecution.findOneAndUpdate({ status: { $in: ['PENDING', 'RETRYING'] }, scheduledAt: { $lte: now }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      { $set: { status: 'PROCESSING', claimedBy: crypto.randomUUID(), claimUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { new: true, sort: { scheduledAt: 1, messageIndex: 1 } });
    if (!execution) { await releaseWorkerSlot(slot); break; }
    try { await deliver(execution, settings, now); }
    finally { await releaseWorkerSlot(slot); }
    processed += 1;
  }
  return processed;
}

export function startCustomAutomationWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await processCustomAutomationsOnce(); }
    catch (error) { console.error('Custom automation worker:', cleanError(error)); }
    finally { running = false; }
  }, 10000);
  return () => clearInterval(timer);
}
