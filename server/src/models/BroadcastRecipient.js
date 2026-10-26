import mongoose from 'mongoose';

const part = new mongoose.Schema({ status: { type: String, enum: ['PENDING', 'SENT'], default: 'PENDING' }, messageId: Number, sentAt: Date }, { _id: false });
const schema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'BroadcastCampaign', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  chatId: { type: String, required: true },
  language: { type: String, enum: ['en', 'ar'], default: 'en' },
  status: { type: String, enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'SKIPPED'], default: 'PENDING' },
  parts: { photo: { type: part, default: undefined }, text: { type: part, default: undefined } },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: Date,
  claimUntil: Date,
  claimedBy: String,
  lastError: { code: String, message: String },
  attemptLog: [{ at: Date, outcome: String, code: String }],
  scheduledAt: Date,
  sentAt: Date,
  skippedReason: String,
}, { timestamps: true });
schema.index({ campaign: 1, user: 1 }, { unique: true });
schema.index({ campaign: 1, status: 1, nextAttemptAt: 1, claimUntil: 1 });
schema.index({ status: 1, claimUntil: 1 });
export const BroadcastRecipient = mongoose.model('BroadcastRecipient', schema);
