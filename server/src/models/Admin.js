import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN'], required: true },
  status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastLoginAt: Date,
}, { timestamps: true });

export const Admin = mongoose.model('Admin', adminSchema);
