import mongoose from 'mongoose';

const telegramLinkTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  consumedAt: Date,
}, { timestamps: true });
telegramLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

export const TelegramLinkToken = mongoose.model('TelegramLinkToken', telegramLinkTokenSchema);
