import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  kind: { type: String, enum: ['EMAIL_CHANGE', 'PASSWORD_RESET'], required: true },
  newEmail: String,
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export const AccountActionToken = mongoose.model('AccountActionToken', schema);
