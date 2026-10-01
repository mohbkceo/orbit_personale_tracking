import mongoose from 'mongoose';
import { touchSchema } from './AnalyticsVisitor.js';

const schema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true }, visitorId: { type: String, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  startedAt: { type: Date, required: true }, lastActivityAt: { type: Date, required: true }, endedAt: Date,
  landingPage: String, landingPath: String, referrer: String, attribution: touchSchema,
  deviceCategory: String, browser: String, os: String, locale: String, timezone: String,
}, { timestamps: true });
schema.index({ startedAt: -1, 'attribution.channel': 1 });
schema.index({ 'attribution.utmCampaign': 1, startedAt: -1 });
schema.index({ visitorId: 1, startedAt: -1 });
export const AnalyticsSession = mongoose.model('AnalyticsSession', schema);
