import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  reason: { type: String, required: true, maxlength: 500 },
  scope: { type: String, enum: ['READ_ONLY'], default: 'READ_ONLY' },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  revokedReason: String,
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export const SupportSession = mongoose.model('SupportSession', schema);
