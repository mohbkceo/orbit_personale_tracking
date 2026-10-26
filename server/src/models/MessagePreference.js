import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  promotionalTelegram: { type: Boolean, default: false },
  consentAt: Date,
  optOutAt: Date,
}, { timestamps: true });
export const MessagePreference = mongoose.model('MessagePreference', schema);
