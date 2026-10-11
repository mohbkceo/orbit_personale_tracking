import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'DzEvent', required: true },
  kind: { type: String, enum: ['discovery', 'change'], required: true },
  fingerprint: { type: String, required: true },
  notificationKey: String,
  deliveredAt: Date,
  channel: { type: String, enum: ['telegram', 'web'] },
}, { timestamps: true });
schema.index({ user: 1, event: 1, kind: 1, fingerprint: 1 }, { unique: true });
schema.index({ user: 1, kind: 1, deliveredAt: -1 });
export const EventDiscoveryDelivery = mongoose.model('EventDiscoveryDelivery', schema);
