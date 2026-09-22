import mongoose from 'mongoose';

const accessSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  activationLink: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivationLink', required: true, unique: true },
  startedAt: { type: Date, required: true },
  activatedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'EXPIRED'], default: 'ACTIVE', index: true },
  planSnapshot: {
    name: String, durationValue: Number, durationUnit: String,
    features: [{ key: String, type: String, enabled: Boolean, limit: Number, value: String }],
  },
}, { timestamps: true });
accessSubscriptionSchema.index({ user: 1, expiresAt: -1 });

export const AccessSubscription = mongoose.model('AccessSubscription', accessSubscriptionSchema);
