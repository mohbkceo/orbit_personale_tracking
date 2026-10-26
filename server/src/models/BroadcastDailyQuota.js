import mongoose from 'mongoose';
const schema = new mongoose.Schema({ day: { type: String, required: true, unique: true }, count: { type: Number, required: true, default: 0 }, expiresAt: { type: Date, required: true } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BroadcastDailyQuota = mongoose.model('BroadcastDailyQuota', schema);
