import mongoose from 'mongoose';

const featureSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  icon: { type: String, required: true, trim: true },
  type: { type: String, enum: ['BOOLEAN', 'LIMIT', 'UNLIMITED', 'TEXT'], required: true },
  publicVisible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
}, { timestamps: true });

export const Feature = mongoose.model('Feature', featureSchema);
