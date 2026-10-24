import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
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
  advertisingAllowed: { type: Boolean, default: undefined },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
