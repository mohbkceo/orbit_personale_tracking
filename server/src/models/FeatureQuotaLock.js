import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: String,
  token: String,
  lockedUntil: { type: Date, default: () => new Date(0) },
}, { timestamps: true });

export const FeatureQuotaLock = mongoose.model('FeatureQuotaLock', schema);
