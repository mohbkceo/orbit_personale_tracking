import mongoose from 'mongoose';
const schema = new mongoose.Schema({ slot: { type: Number, required: true, unique: true }, claimedBy: String, claimUntil: Date }, { timestamps: true });
schema.index({ slot: 1, claimUntil: 1 });
export const BroadcastWorkerSlot = mongoose.model('BroadcastWorkerSlot', schema);
