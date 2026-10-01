import mongoose from 'mongoose';
import { touchSchema } from './AnalyticsVisitor.js';

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true }, name: { type: String, required: true, index: true },
  visitorId: { type: String, index: true }, sessionId: { type: String, index: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  source: { type: String, enum: ['web', 'server', 'mobile', 'system', 'admin', 'integration'], required: true },
  path: String, properties: mongoose.Schema.Types.Mixed, occurredAt: { type: Date, required: true },
  attribution: { firstTouch: touchSchema, lastTouch: touchSchema, lastNonDirectTouch: touchSchema },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ name: 1, occurredAt: -1 });
schema.index({ occurredAt: -1, 'attribution.lastTouch.channel': 1 });
schema.index({ user: 1, occurredAt: -1 });
export const AnalyticsEvent = mongoose.model('AnalyticsEvent', schema);
