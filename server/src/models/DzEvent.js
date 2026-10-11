import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  provider: { type: String, default: 'dzevent', required: true },
  externalId: { type: String, required: true },
  title: { type: String, required: true, maxlength: 180 },
  slug: String,
  description: String,
  startsAt: { type: Date, index: true },
  endsAt: Date,
  scheduleStatus: { type: String, index: true },
  format: String,
  venue: { name: String, address: String },
  wilaya: { id: String, code: String, slug: String, names: { fr: String, en: String, ar: String } },
  eventType: mongoose.Schema.Types.Mixed,
  categories: [mongoose.Schema.Types.Mixed],
  cover: mongoose.Schema.Types.Mixed,
  website: String,
  providerUrl: String,
  orbitVisibility: {
    status: { type: String, enum: ['visible', 'hidden', 'featured'], default: 'visible' },
    reason: String,
    changedAt: Date,
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  lastSyncedAt: Date,
  lastSeenAt: Date,
  consecutiveMissingSyncs: { type: Number, default: 0 },
  verificationStatus: { type: String, enum: ['verified', 'unavailable'], default: 'verified' },
  providerSnapshotHash: String,
}, { timestamps: true });
schema.index({ provider: 1, externalId: 1 }, { unique: true });
schema.index({ 'wilaya.slug': 1, startsAt: 1 });
schema.index({ 'orbitVisibility.status': 1, startsAt: 1 });
export const DzEvent = mongoose.model('DzEvent', schema);
