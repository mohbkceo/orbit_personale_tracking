import mongoose from 'mongoose';

const variant = new mongoose.Schema({ text: { type: String, required: true, maxlength: 6000 } }, { _id: false });
const button = new mongoose.Schema({ label: { type: String, required: true, maxlength: 64 }, url: String, action: { type: String, enum: ['ACK', 'PROMO_OPTOUT'] } }, { _id: false });
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 500 },
  category: { type: String, enum: ['ANNOUNCEMENT', 'PRODUCT_UPDATE', 'PROMOTION', 'IMPORTANT_NOTICE', 'CUSTOM'], required: true },
  channel: { type: String, enum: ['telegram'], default: 'telegram' },
  status: { type: String, enum: ['DRAFT', 'PREPARING', 'SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED'], default: 'DRAFT', index: true },
  variants: { en: { type: variant, required: true }, ar: { type: variant, required: true } },
  imageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  photoFileId: { type: String, select: false },
  buttons: { type: [[button]], default: [] },
  audience: { type: mongoose.Schema.Types.Mixed, required: true },
  scheduledAt: Date,
  snapshotStartedAt: Date,
  snapshotCompletedAt: Date,
  snapshotClaimUntil: Date,
  snapshotBy: String,
  contentFingerprint: String,
  lastError: { type: String, maxlength: 300 },
  startedAt: Date,
  workerVisitedAt: Date,
  finishedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  launchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  launchedAt: Date,
  pausedFrom: String,
  stats: { targeted: { type: Number, default: 0 }, eligible: { type: Number, default: 0 }, skipped: { type: Number, default: 0 }, sent: { type: Number, default: 0 }, failed: { type: Number, default: 0 } },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ status: 1, scheduledAt: 1 });
schema.index({ status: 1, workerVisitedAt: 1, startedAt: 1 });
export const BroadcastCampaign = mongoose.model('BroadcastCampaign', schema);
