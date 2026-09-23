import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  focus: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyFocus', default: null },
  type: { type: String, required: true },
  channel: { type: String, enum: ['system', 'web', 'telegram'], default: 'system' },
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });
schema.index({ user: 1, task: 1, createdAt: -1 });
schema.index({ user: 1, focus: 1, createdAt: -1 });
export const TaskExecutionEvent = mongoose.model('TaskExecutionEvent', schema);
