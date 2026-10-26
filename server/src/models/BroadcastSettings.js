import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  enabled: { type: Boolean, default: true },
  requestsPerSecond: { type: Number, default: 15, min: 1, max: 20 },
  concurrency: { type: Number, default: 2, min: 1, max: 10 },
  batchSize: { type: Number, default: 25, min: 1, max: 100 },
  maxAttempts: { type: Number, default: 4, min: 1, max: 10 },
  retryDelaySeconds: { type: Number, default: 60, min: 10, max: 3600 },
  dailyCampaignLimit: { type: Number, default: 10, min: 1, max: 100 },
  deliveryStart: { type: String, default: '08:00' },
  deliveryEnd: { type: String, default: '22:00' },
  quietHours: { type: Boolean, default: true },
  duplicateWindowHours: { type: Number, default: 24, min: 0, max: 720 },
  nextSlotAt: { type: Date, default: Date.now },
  rateLimitedUntil: Date,
}, { timestamps: true });
export const BroadcastSettings = mongoose.model('BroadcastSettings', schema);
