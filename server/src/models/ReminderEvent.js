import mongoose from 'mongoose';

const reminderEventSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reminderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reminder', required: true },
  eventType: {
    type: String,
    enum: [
      'generated',
      'scheduled',
      'activated',
      'sent',
      'delivery_failed',
      'interacted',
      'completed',
      'snoozed',
      'rescheduled',
      'blocked',
      'cancelled',
      'suppressed',
      'expired',
    ],
    required: true,
  },
  channel: { type: String, enum: ['system', 'web', 'telegram'], default: 'system' },
  timestamp: { type: Date, default: Date.now },
  metadata: mongoose.Schema.Types.Mixed,
});
reminderEventSchema.index({ user: 1, reminderId: 1, timestamp: -1 });
export const ReminderEvent = mongoose.model('ReminderEvent', reminderEventSchema);
