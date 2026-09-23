import mongoose from 'mongoose';

const recurrenceSchema = new mongoose.Schema(
  {
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] },
    interval: { type: Number, min: 1, default: 1 },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    dayOfMonth: { type: Number, min: 1, max: 31 },
    startDate: Date,
    endDate: Date,
  },
  { _id: false },
);

const taskSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', maxlength: 3000 },
    status: { type: String, enum: ['todo', 'in_progress', 'completed', 'cancelled'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    dueDate: { type: Date, default: null, index: true },
    dueTime: { type: String, default: '' },
    reminderMode: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
    category: { type: String, default: 'Personal' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    recurring: { type: Boolean, default: false },
    recurringRule: recurrenceSchema,
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    occurrenceKey: { type: String, default: null },
    nextOccurrenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    recurrenceEnded: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    relatedEntityType: String,
    relatedEntityId: mongoose.Schema.Types.ObjectId,
    completedAt: Date,
    nextAction: { type: String, default: '', trim: true, maxlength: 500 },
    estimatedMinutes: { type: Number, default: null, min: 1, max: 10080 },
    startedAt: Date,
    lastStartedAt: Date,
    startCount: { type: Number, default: 0 },
    lastProgressAt: Date,
    lastReminderInteractionAt: Date,
    ignoreCount: { type: Number, default: 0 },
    postponeCount: { type: Number, default: 0 },
    blockedCount: { type: Number, default: 0 },
    executionState: { type: String, enum: ['idle', 'planned', 'started', 'blocked', 'postponed', 'completed', 'cancelled'], default: 'idle' },
    createdVia: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taskSchema.index({ title: 'text', description: 'text', tags: 'text' });
taskSchema.index({ user: 1, archived: 1, dueDate: 1 });
taskSchema.index({ user: 1, archived: 1, status: 1, reminderMode: 1, dueDate: 1 });
taskSchema.index({ user: 1, seriesId: 1, occurrenceKey: 1 }, { unique: true, partialFilterExpression: { seriesId: { $type: 'objectId' }, occurrenceKey: { $type: 'string' } } });
export const Task = mongoose.model('Task', taskSchema);
