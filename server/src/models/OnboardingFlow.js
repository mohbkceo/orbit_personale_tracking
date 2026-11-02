import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    key: { type: String, default: 'orbit', required: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['draft', 'published'], required: true },
    version: { type: Number, required: true },
    pages: { type: [mongoose.Schema.Types.Mixed], required: true },
    settings: { type: mongoose.Schema.Types.Mixed, required: true },
    revision: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    publishedAt: Date,
  },
  { timestamps: true },
);
schema.index({ key: 1, version: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
schema.pre('save', function () {
  if (!this.isNew && this.isModified() && this.$locals.wasPublished)
    throw new Error('Published flows are immutable');
});
schema.post('init', function (doc) {
  doc.$locals.wasPublished = doc.status === 'published';
});
schema.post('save', function (doc) {
  doc.$locals.wasPublished = doc.status === 'published';
});
export const OnboardingFlow = mongoose.model('OnboardingFlow', schema);

// A single pointer switches the active snapshot atomically. Old sessions retain their own flow.
const configuration = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'global' },
    activeFlow: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingFlow' },
    sequence: { type: Number, default: 1 },
  },
  { timestamps: true },
);
export const OnboardingConfiguration = mongoose.model('OnboardingConfiguration', configuration);
