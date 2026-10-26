import mongoose from 'mongoose';

const telegramConnectionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  telegramUserId: { type: String, required: true, unique: true },
  chatId: { type: String, required: true },
  telegramUsername: String,
  linkedAt: { type: Date, default: Date.now },
  lastInteractionAt: Date,
  lastUpdateAt: Date,
}, { timestamps: true });
telegramConnectionSchema.index({ telegramUsername: 1 });
telegramConnectionSchema.index({ lastInteractionAt: -1 });

export const TelegramConnection = mongoose.model('TelegramConnection', telegramConnectionSchema);
