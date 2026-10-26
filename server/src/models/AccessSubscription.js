import mongoose from 'mongoose';

const accessSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    activationLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ActivationLink',
      required() { return this.source === 'ACTIVATION_LINK'; },
    },
    source: { type: String, enum: ['ACTIVATION_LINK', 'SLICKPAY', 'ADMIN_GRANT'], default: 'ACTIVATION_LINK' },
    grantKind: { type: String, enum: ['PAYMENT_CONFIRMED', 'COMPLIMENTARY', 'SUPPORT_COMPENSATION'] },
    paymentReference: String,
    grantReason: String,
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    idempotencyKey: String,
    requestFingerprint: String,
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', required() { return this.source === 'SLICKPAY'; } },
    startedAt: { type: Date, required: true },
    activatedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'REVOKED'], default: 'ACTIVE', index: true },
    entitlementVersion: { type: Number, default: undefined },
    planSnapshot: {
      name: String,
      durationValue: Number,
      durationUnit: String,
      features: [new mongoose.Schema({ key: String, type: { type: String }, enabled: Boolean, limit: Number, value: String }, { _id: false })],
    },
    entitlementOverrides: [new mongoose.Schema({ key: String, enabled: Boolean, limit: Number, value: String }, { _id: false })],
  },
  { timestamps: true },
);
accessSubscriptionSchema.index({ user: 1, expiresAt: -1 });
accessSubscriptionSchema.index({ user: 1, status: 1, expiresAt: -1 });
accessSubscriptionSchema.index({ plan: 1, status: 1, expiresAt: -1 });
accessSubscriptionSchema.index({ activationLink: 1 }, { name: 'activationLink_partial_unique', unique: true, partialFilterExpression: { activationLink: { $type: 'objectId' } } });
accessSubscriptionSchema.index({ order: 1 }, { unique: true, partialFilterExpression: { order: { $type: 'objectId' } } });
accessSubscriptionSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export const AccessSubscription = mongoose.model('AccessSubscription', accessSubscriptionSchema);
