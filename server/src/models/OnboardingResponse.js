import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    flow: { type: mongoose.Schema.Types.ObjectId, ref: 'OnboardingFlow', required: true },
    version: { type: Number, required: true },
    attempt: { type: String, default: 'initial' },
    plan: { type: String, default: 'Free' }, // Subscription name at the start of this session.
    answers: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['partial', 'completed', 'skipped'], default: 'partial' },
    pageId: String,
    seenPages: { type: [String], default: [] },
    seenQuestions: { type: [String], default: [] },
    passedPages: { type: [String], default: [] },
    skippedPages: { type: [String], default: [] },
    skippedQuestions: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    completedAt: Date,
    skippedAt: Date,
    revision: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);
schema.index({ user: 1, flow: 1, attempt: 1 }, { unique: true });
schema.index({ createdAt: -1, flow: 1, status: 1 });
schema.index({ startedAt: -1, flow: 1, status: 1 });
schema.index({ plan: 1, createdAt: -1 });
schema.index({ plan: 1, startedAt: -1 });
export const OnboardingResponse = mongoose.model('OnboardingResponse', schema);
