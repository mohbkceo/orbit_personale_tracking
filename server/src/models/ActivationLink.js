import mongoose from 'mongoose';

const activationLinkSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  encryptedToken: { type: String, select: false },
  tokenIv: { type: String, select: false },
  tokenAuthTag: { type: String, select: false },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
  planSnapshot: { name: String, durationValue: Number, durationUnit: String },
  status: { type: String, enum: ['ACTIVE', 'USED', 'REVOKED', 'EXPIRED'], default: 'ACTIVE', index: true },
  createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  expiresAt: { type: Date, index: true },
  activatedAt: Date,
  activatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reservedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  intendedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  openCount: { type: Number, default: 0 },
  firstOpenedAt: Date,
  lastOpenedAt: Date,
  note: { type: String, maxlength: 500, default: '' },
}, { timestamps: true });

export const ActivationLink = mongoose.model('ActivationLink', activationLinkSchema);
