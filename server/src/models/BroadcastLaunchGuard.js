import mongoose from 'mongoose';
const schema = new mongoose.Schema({ fingerprint: { type: String, required: true, unique: true }, campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'BroadcastCampaign', required: true }, expiresAt: { type: Date, required: true } }, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BroadcastLaunchGuard = mongoose.model('BroadcastLaunchGuard', schema);
