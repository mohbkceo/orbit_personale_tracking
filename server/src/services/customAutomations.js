import { CustomAutomation, AutomationExecution } from '../models/CustomAutomation.js';
import { AuditLog } from '../models/AuditLog.js';
import { AccessSubscription } from '../models/AccessSubscription.js';
import { User } from '../models/User.js';
import { Plan } from '../models/Plan.js';
import { audienceSelection } from '../validators/broadcast.js';
import { previewAudience } from './broadcastAudience.js';
import { broadcastParts } from './broadcastContent.js';
import { adminTelegramRecipient } from './adminTelegramPolicy.js';

export function automationCampaign(automation, index) {
  const message = automation.messages[index];
  return { _id: automation._id, category: automation.promotional ? 'PROMOTION' : 'IMPORTANT_NOTICE', imageId: message.imageId,
    variants: { en: { text: message.text }, ar: { text: message.text } }, buttons: message.buttons };
}

export function automationPreview(automation, index = 0) {
  return broadcastParts(automationCampaign(automation, index), 'en', { firstName: 'Alex', fullName: 'Alex Example', planName: 'Orbit Plus', expiryDate: '31 Dec 2026' });
}

export async function matchesAutomationAudience(automation, userId, now = new Date()) {
  const selection = audienceSelection.parse({ filters: {
    subscription: ['FREE', 'ACTIVE'].includes(automation.audience.type) ? automation.audience.type : 'ALL',
    planIds: automation.audience.type === 'PLANS' ? automation.audience.planIds.map(String) : [],
  }, allMatching: false, includeIds: [String(userId)] });
  return (await previewAudience(selection, { promotional: automation.promotional, now })).deliverable === 1;
}

// Audit rows are committed in the same transactions as account creation and all
// three activation paths (activation links, confirmed payments, admin grants).
// Replay is intentional: unique execution keys make catch-up restart-safe even
// if a source transaction commits late or a scheduler stops halfway through.
export async function scheduleAutomation(automation, now = new Date()) {
  if (!automation.enabled || !automation.enabledAt) return;
  const start = new Date(automation.enabledAt);
  async function enqueue(user, sourceEventId, at, subscription) {
    if (await AutomationExecution.exists({ automation: automation._id, user, sourceEventId, revision: { $ne: automation.revision } })) return;
    // Enrollment does not require Telegram yet; each due message checks the live
    // connection. A user may link Telegram between registration and a later step.
    const operations = automation.messages.map((message, messageIndex) => ({ updateOne: {
      filter: { automation: automation._id, user, sourceEventId, messageIndex },
      update: { $setOnInsert: { automation: automation._id, revision: automation.revision, user, sourceEventId, messageIndex,
        scheduledAt: new Date(at.getTime() + message.delayMinutes * 60000), status: 'PENDING', attempts: 0,
        ...(subscription ? { subscription: subscription._id, expiresAt: subscription.expiresAt } : {}) } }, upsert: true,
    } }));
    try { await AutomationExecution.bulkWrite(operations, { ordered: false }); }
    catch (error) { if (!(error.code === 11000 || error.writeErrors?.length && error.writeErrors.every((entry) => entry.code === 11000))) throw error; }
    // An edit/disable can race enrollment. Never leave that revision's jobs live.
    if (!await CustomAutomation.exists({ _id: automation._id, enabled: true, revision: automation.revision })) {
      await AutomationExecution.updateMany({ automation: automation._id, revision: automation.revision, status: { $in: ['PENDING', 'RETRYING'] } }, { $set: { status: 'CANCELLED' } });
    }
  }
  const type = automation.trigger.type;
  if (['REGISTRATION', 'SUBSCRIPTION_ACTIVATED'].includes(type)) {
    const registration = type === 'REGISTRATION';
    const events = AuditLog.find({ event: { $in: registration ? ['USER_CREATED'] : ['ACCESS_ACTIVATED', 'ADMIN_ACCESS_GRANTED'] }, createdAt: { $gte: start, $lte: now } }).sort({ _id: 1 }).lean().cursor();
    for await (const event of events) {
      if (registration) await enqueue(event.targetId, `registration:${event.targetId}`, new Date(event.createdAt));
      else {
        const subscription = await AccessSubscription.findById(event.targetId).lean();
        if (subscription) await enqueue(subscription.user, `activation:${subscription._id}`, new Date(subscription.activatedAt), subscription);
      }
    }
  } else if (type === 'SCHEDULED') {
    const at = new Date(automation.trigger.configuration.scheduledAt);
    if (at > now) return;
    const users = User.find({ status: 'ACTIVE', createdAt: { $lte: at } }).select('_id').lean().cursor();
    for await (const user of users) await enqueue(user._id, `scheduled:${at.toISOString()}`, at);
  } else {
    const lead = type === 'BEFORE_EXPIRY' ? automation.trigger.configuration.leadMinutes * 60000 : 0;
    const subscriptions = AccessSubscription.find({ status: { $in: ['ACTIVE', 'EXPIRED', null] }, expiresAt: { $gte: start, $lte: new Date(now.getTime() + lead) } }).lean().cursor();
    for await (const subscription of subscriptions) await enqueue(subscription.user, `expiry:${subscription._id}:${subscription.expiresAt.toISOString()}`, new Date(subscription.expiresAt.getTime() - lead), subscription);
  }
}

export async function eligibleExecution(automation, execution, now = new Date()) {
  if (!automation?.enabled || automation.revision !== execution.revision) return null;
  const recipient = await adminTelegramRecipient(execution.user, { promotional: automation.promotional, chatId: execution.chatId });
  if (!recipient || !await matchesAutomationAudience(automation, execution.user, now)) return null;
  if (execution.subscription) {
    const source = await AccessSubscription.findById(execution.subscription).lean();
    if (!source || source.status === 'REVOKED') return null;
    recipient.subscription = source;
    if (['BEFORE_EXPIRY', 'AFTER_EXPIRY'].includes(automation.trigger.type)) {
      if (+source.expiresAt !== +execution.expiresAt) return null;
      const latest = await AccessSubscription.findOne({ user: execution.user, status: { $in: ['ACTIVE', null] }, expiresAt: { $gt: now } }).sort({ expiresAt: -1 }).lean();
      if (automation.trigger.type === 'AFTER_EXPIRY' && latest) return null;
      if (automation.trigger.type === 'BEFORE_EXPIRY' && (!latest || +latest.expiresAt !== +execution.expiresAt || source.expiresAt <= now)) return null;
    }
  }
  return recipient;
}

export async function validateAutomationReferences(input) {
  if (input.audience.type === 'PLANS') {
    const count = await Plan.countDocuments({ _id: { $in: input.audience.planIds }, kind: 'PAID', status: 'ACTIVE' });
    if (count !== new Set(input.audience.planIds).size) return false;
  }
  return true;
}
