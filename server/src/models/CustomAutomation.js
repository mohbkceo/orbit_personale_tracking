import mongoose from 'mongoose';

const button = new mongoose.Schema({ label: String, url: String }, { _id: false });
const message = new mongoose.Schema({ order: Number, text: String, imageId: mongoose.Schema.Types.ObjectId, buttons: [[button]], delayMinutes: Number }, { _id: false });
const schema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 120 },
  enabled: { type: Boolean, default: false },
  promotional: { type: Boolean, default: false },
  trigger: { type: { type: String, required: true }, configuration: { scheduledAt: Date, leadMinutes: Number } },
  audience: { type: { type: String, default: 'ALL' }, planIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }] },
  messages: [message],
  revision: { type: Number, default: 1 },
  enabledAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });
schema.index({ enabled: 1 });
export const CustomAutomation = mongoose.model('CustomAutomation', schema);

const execution = new mongoose.Schema({
  automation: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomAutomation', required: true },
  revision: Number,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sourceEventId: { type: String, required: true },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessSubscription' },
  expiresAt: Date,
  messageIndex: { type: Number, required: true },
  scheduledAt: { type: Date, required: true },
  status: { type: String, enum: ['PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'SKIPPED', 'CANCELLED', 'FAILED'], default: 'PENDING' },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: Date,
  claimUntil: Date,
  claimedBy: String,
  chatId: String,
  photoSentAt: Date,
  textSentAt: Date,
  sentAt: Date,
  lastError: String,
}, { timestamps: true });
execution.index({ automation: 1, user: 1, sourceEventId: 1, messageIndex: 1 }, { unique: true });
execution.index({ status: 1, scheduledAt: 1, nextAttemptAt: 1 });
execution.index({ status: 1, claimUntil: 1 });
execution.index({ user: 1 });
export const AutomationExecution = mongoose.model('AutomationExecution', execution);
