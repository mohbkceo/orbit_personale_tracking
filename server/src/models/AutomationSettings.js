import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

export const AutomationSettings = mongoose.model('AutomationSettings', schema);
