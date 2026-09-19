import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  durationValue: { type: Number, required: true, min: 1 },
  durationUnit: { type: String, enum: ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'], required: true },
  description: { type: String, maxlength: 500, default: '' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

export const Plan = mongoose.model('Plan', planSchema);
