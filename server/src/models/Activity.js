import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true }, entityType: { type: String, required: true, index: true },
    entityId: mongoose.Schema.Types.ObjectId, description: { type: String, required: true },
    previousData: mongoose.Schema.Types.Mixed, newData: mongoose.Schema.Types.Mixed,
    source: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
  }, { timestamps: true },
);
activitySchema.index({ createdAt: -1 });
export const Activity = mongoose.model('Activity', activitySchema);
