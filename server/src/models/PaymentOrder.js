import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  key: { type: String, required: true },
  openKey: String,
  state: { type: String, enum: ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED'], default: 'PENDING' },
  amountMinor: { type: Number, required: true }, currency: { type: String, enum: ['DZD'], default: 'DZD' },
  environment: { type: String, enum: ['sandbox', 'production'], required: true },
  planSnapshot: { name: String, durationValue: Number, durationUnit: String,
    features: [new mongoose.Schema({ key: String, name: String, type: { type: String }, enabled: Boolean, limit: Number, value: String }, { _id: false })] },
  invoiceId: String, paymentReference: String, paymentUrl: { type: String, select: false },
  creationStartedAt: Date, paidAt: Date, quoteExpiresAt: Date,
  nextVerifyAt: Date, verifyAttempts: { type: Number, default: 0 }, verifyLeaseUntil: Date,
  reviewCode: String,
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessSubscription' },
  // Attribution and encrypted ad context are never part of order API projections.
  analytics: { type: mongoose.Schema.Types.Mixed, select: false },
  advertising: { type: mongoose.Schema.Types.Mixed, select: false },
}, { timestamps: true });
schema.index({ user: 1, key: 1 }, { unique: true });
schema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } });
schema.index({ environment: 1, invoiceId: 1 }, { unique: true, partialFilterExpression: { invoiceId: { $type: 'string' } } });
schema.index({ environment: 1, paymentReference: 1 }, { unique: true, partialFilterExpression: { paymentReference: { $type: 'string' } } });
schema.index({ state: 1, nextVerifyAt: 1 });
export const PaymentOrder = mongoose.model('PaymentOrder', schema);
