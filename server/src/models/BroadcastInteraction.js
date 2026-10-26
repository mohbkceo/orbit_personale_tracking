import mongoose from 'mongoose';
const schema = new mongoose.Schema({ campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'BroadcastCampaign', required: true, index: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, action: { type: String, enum: ['ACK', 'PROMO_OPTOUT'], required: true }, updateId: { type: Number, unique: true, sparse: true } }, { timestamps: true });
schema.index({ campaign: 1, createdAt: -1 });
export const BroadcastInteraction = mongoose.model('BroadcastInteraction', schema);
