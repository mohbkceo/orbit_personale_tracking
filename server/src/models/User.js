import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  // Public checkout accounts collect optional personalization after purchase.
  gender: { type: String, enum: ['MALE', 'FEMALE'] },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
  onboardingCompletedAt: Date,
  lastLoginAt: Date,
  accessVersion: { type: Number, default: 0 },
  advertisingAllowed: { type: Boolean, default: undefined },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
