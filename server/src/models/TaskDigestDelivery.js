import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  localDate: { type: String, required: true },
  time: { type: String, required: true },
  claimedAt: { type: Date, required: true },
  sentAt: Date,
}, { timestamps: true });
schema.index({ user: 1, localDate: 1, time: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
export const TaskDigestDelivery = mongoose.model('TaskDigestDelivery', schema);
