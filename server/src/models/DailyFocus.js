import mongoose from 'mongoose';

const item = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  position: { type: Number, required: true },
  source: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
  reviewDecision: { type: String, enum: ['tomorrow', 'backlog', 'reschedule', 'drop'], default: null },
  reviewedAt: Date,
}, { _id: false });

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },
  timezone: { type: String, required: true },
  items: { type: [item], default: [] },
  planningStartedAt: Date,
  planningCompleted: { type: Boolean, default: false },
  completedAt: Date,
  source: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
  eveningReviewedAt: Date,
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ user: 1, date: 1 }, { unique: true });
schema.index({ user: 1, 'items.task': 1, date: 1 });
export const DailyFocus = mongoose.model('DailyFocus', schema);
