import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updateId: Number,
  kind: { type: String, enum: ['MESSAGE', 'CALLBACK'], required: true },
  category: { type: String, required: true, maxlength: 40 },
  createdAt: { type: Date, default: Date.now },
});
schema.index({ user: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });
schema.index({ updateId: 1 }, { unique: true, partialFilterExpression: { updateId: { $type: 'number' } } });
export const TelegramInteraction = mongoose.model('TelegramInteraction', schema);
