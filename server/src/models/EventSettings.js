import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  provider: {
    name: { type: String, default: 'dzevent' },
    enabled: { type: Boolean, default: true },
    encryptedApiKey: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    keyConfiguredAt: Date,
    lastConnectionTestAt: Date,
    lastConnectionTestSuccess: Boolean,
    lastConnectionError: String,
  },
  integration: { type: mongoose.Schema.Types.Mixed, default: {} },
  catalog: { type: mongoose.Schema.Types.Mixed, default: {} },
  discovery: { type: mongoose.Schema.Types.Mixed, default: {} },
  reminders: { type: mongoose.Schema.Types.Mixed, default: {} },
  changes: { type: mongoose.Schema.Types.Mixed, default: {} },
  delivery: { type: mongoose.Schema.Types.Mixed, default: {} },
  quietHours: { type: mongoose.Schema.Types.Mixed, default: {} },
  userControls: { type: mongoose.Schema.Types.Mixed, default: {} },
  limits: { type: mongoose.Schema.Types.Mixed, default: {} },
  sync: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const EventSettings = mongoose.model('EventSettings', schema);
