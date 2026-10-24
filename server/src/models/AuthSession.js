import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  lastSeenAt: Date,
  ip: String,
  userAgent: String,
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const AuthSession = mongoose.model('AuthSession', schema);
