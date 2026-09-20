import mongoose from 'mongoose';

const telegramSessionSchema = new mongoose.Schema({
  telegramUserId: { type: String, required: true },
  chatId: { type: String, required: true },
  action: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

telegramSessionSchema.index({ telegramUserId: 1, chatId: 1 }, { unique: true });
telegramSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const TelegramSession = mongoose.model('TelegramSession', telegramSessionSchema);
