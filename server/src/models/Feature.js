import mongoose from 'mongoose';

const featureSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 500 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  icon: { type: String, required: true, trim: true },
  type: { type: String, enum: ['BOOLEAN', 'LIMIT', 'UNLIMITED', 'TEXT'], required: true },
  scope: { type: String, enum: ['SECTION', 'CAPABILITY'], default: 'CAPABILITY' },
  accessMode: { type: String, enum: ['FREE', 'PLAN_BASED', 'DISABLED'], default: 'PLAN_BASED' },
  locked: {
    title: { type: String, default: '', maxlength: 120 },
    description: { type: String, default: '', maxlength: 500 },
    explanation: { type: String, default: '', maxlength: 500 },
    presentation: { type: String, enum: ['BLUR', 'PLACEHOLDER', 'INFORMATION'], default: 'BLUR' },
    ctaLabel: { type: String, default: 'Explore plans', maxlength: 80 },
    recommendedPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    visibleWhenLocked: { type: Boolean, default: true },
  },
  publicVisible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
}, { timestamps: true });

export const Feature = mongoose.model('Feature', featureSchema);
