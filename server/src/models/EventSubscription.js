import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'DzEvent', required: true },
  provider: { type: String, default: 'dzevent' },
  externalEventId: { type: String, required: true },
  status: { type: String, enum: ['active', 'unfollowed'], default: 'active' },
  reminderOffsetsMinutes: [Number],
  deliveryChannels: [String],
  changeAlerts: mongoose.Schema.Types.Mixed,
  quietHoursPolicy: { type: String, enum: ['move_earlier', 'deliver_exact', 'skip', null], default: null },
  reminderIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reminder' }],
  followedAt: Date,
  unfollowedAt: Date,
}, { timestamps: true });
schema.index({ user: 1, provider: 1, externalEventId: 1 }, { unique: true });
schema.index({ event: 1, status: 1 });
export const EventSubscription = mongoose.model('EventSubscription', schema);
