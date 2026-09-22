import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, sparse: true, trim: true },
  durationValue: { type: Number, required: true, min: 1 },
  durationUnit: { type: String, enum: ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'], required: true },
  description: { type: String, maxlength: 500, default: '' },
  price: {
    amount: { type: Number, min: 0, default: 0 },
    originalAmount: { type: Number, min: 0, default: null },
    currency: { type: String, default: 'USD' },
    suffix: { type: String, default: '' },
  },
  appearance: {
    icon: { type: String, default: '' },
    color: { type: String, default: '#173d30' },
    textColor: { type: String, default: '#ffffff' },
    badge: { type: String, default: '' },
    highlighted: { type: Boolean, default: false },
  },
  public: {
    visible: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    ctaText: { type: String, default: 'Get started' },
    shortDescription: { type: String, default: '' },
  },
  features: [{
    feature: { type: mongoose.Schema.Types.ObjectId, ref: 'Feature', required: true },
    enabled: { type: Boolean, default: true },
    limit: { type: Number, default: null },
    value: { type: String, default: '' },
  }],
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });

planSchema.pre('validate', function setLegacySlug(next) {
  if (!this.slug && this.name) this.slug = this.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  next();
});

export const Plan = mongoose.model('Plan', planSchema);
