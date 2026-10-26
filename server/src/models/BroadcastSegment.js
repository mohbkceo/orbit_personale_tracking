import mongoose from 'mongoose';
const schema = new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 100 }, filters: { type: mongoose.Schema.Types.Mixed, required: true }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true } }, { timestamps: true });
schema.index({ createdBy: 1, name: 1 }, { unique: true });
export const BroadcastSegment = mongoose.model('BroadcastSegment', schema);
