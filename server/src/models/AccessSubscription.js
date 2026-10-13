import mongoose from 'mongoose';

const accessSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    activationLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ActivationLink',
      required() { return this.source !== 'SLICKPAY'; },
    },
    source: { type: String, enum: ['ACTIVATION_LINK', 'SLICKPAY'], default: 'ACTIVATION_LINK' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', required() { return this.source === 'SLICKPAY'; } },
    startedAt: { type: Date, required: true },
    activatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED'], default: 'ACTIVE', index: true },
    planSnapshot: {
      name: String,
      durationValue: Number,
      durationUnit: String,
      features: [new mongoose.Schema({ key: String, type: { type: String }, enabled: Boolean, limit: Number, value: String }, { _id: false })],
    },
  },
  { timestamps: true },
);
accessSubscriptionSchema.index({ user: 1, expiresAt: -1 });
accessSubscriptionSchema.index({ activationLink: 1 }, { name: 'activationLink_partial_unique', unique: true, partialFilterExpression: { activationLink: { $type: 'objectId' } } });
accessSubscriptionSchema.index({ order: 1 }, { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } });

export const AccessSubscription = mongoose.model('AccessSubscription', accessSubscriptionSchema);
