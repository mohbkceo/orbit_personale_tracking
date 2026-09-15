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
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: '', maxlength: 3000 },
    status: { type: String, enum: ['todo', 'in_progress', 'completed', 'cancelled'], default: 'todo', index: true },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
    dueDate: { type: Date, default: null, index: true },
    dueTime: { type: String, default: '' },
    category: { type: String, default: 'Personal' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    recurring: { type: Boolean, default: false },
    recurringRule: recurrenceSchema,
    tags: [{ type: String, trim: true }],
    relatedEntityType: String,
    relatedEntityId: mongoose.Schema.Types.ObjectId,
    completedAt: Date,
    createdVia: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taskSchema.index({ title: 'text', description: 'text', tags: 'text' });
export const Task = mongoose.model('Task', taskSchema);
