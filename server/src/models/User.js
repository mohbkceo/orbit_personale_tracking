import mongoose from 'mongoose';
import { normalizePhone } from '../utils/userIdentity.js';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, lowercase: true, trim: true },
  phone: { type: String, set: (value) => value == null ? undefined : normalizePhone(value) },
  passwordHash: { type: String, required: true, select: false },
  // Public checkout accounts collect optional personalization after purchase.
  gender: { type: String, enum: ['MALE', 'FEMALE'] },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  onboardingCompletedAt: Date,
  // Optional product tour. Older accounts have no value and are never auto-prompted.
  firstUseOnboarding: {
    status: { type: String, enum: ['NOT_STARTED', 'IN_PROGRESS', 'SKIPPED', 'COMPLETED'] },
    step: { type: String, enum: ['welcome', 'first-action', 'telegram', 'finish'] },
    autoPresent: Boolean,
    startedAt: Date,
    dismissedAt: Date,
    completedAt: Date,
  },
  lastLoginAt: Date,
  planSelectionSkippedAt: Date,
  accessVersion: { type: Number, default: 0 },
  authVersion: { type: Number, default: 0 },
  advertisingAllowed: { type: Boolean, default: undefined },
}, { timestamps: true });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ lastLoginAt: -1 });
userSchema.index({ fullName: 1 });
// Production autoIndex is disabled. Use migrate:identities; never syncIndexes().
userSchema.index({ email: 1 }, { name: 'user_email_unique_present', unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { name: 'user_phone_unique_present', unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.pre('validate', function () {
  if (!this.email && !this.phone) this.invalidate('phone', 'An email or phone identity is required');
});

export const User = mongoose.model('User', userSchema);
