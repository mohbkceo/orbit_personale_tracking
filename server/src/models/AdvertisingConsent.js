import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  granted: { type: Boolean, required: true },
  policy: { type: String, default: 'ads-v1' },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
export const AdvertisingConsent = mongoose.model('AdvertisingConsent', schema);
