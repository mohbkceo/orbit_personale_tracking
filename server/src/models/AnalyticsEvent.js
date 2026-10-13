import mongoose from 'mongoose';
import { touchSchema } from './AnalyticsVisitor.js';

const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true }, name: { type: String, required: true, index: true },
  visitorId: { type: String, index: true }, sessionId: { type: String, index: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  source: { type: String, enum: ['web', 'server', 'mobile', 'system', 'admin', 'integration'], required: true },
  path: String, properties: mongoose.Schema.Types.Mixed, occurredAt: { type: Date, required: true },
  attribution: { firstTouch: touchSchema, lastTouch: touchSchema, lastNonDirectTouch: touchSchema },
  // Embedded outbox: persisted atomically with the internal conversion, never public.
  metaDelivery: { type: new mongoose.Schema({
    consent: { type: mongoose.Schema.Types.ObjectId, ref: 'AdvertisingConsent' },
    state: { type: String, enum: ['PENDING', 'SENDING', 'SENT', 'CANCELLED', 'DEAD'] },
    attempts: { type: Number, default: 0 }, nextAttemptAt: Date, leaseUntil: Date,
    payload: { encrypted: String, iv: String, authTag: String },
    lastCode: String, sentAt: Date,
  }, { _id: false }), select: false },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ 'metaDelivery.state': 1, 'metaDelivery.nextAttemptAt': 1 });
schema.index({ name: 1, occurredAt: -1 });
schema.index({ occurredAt: -1, 'attribution.lastTouch.channel': 1 });
schema.index({ user: 1, occurredAt: -1 });
export const AnalyticsEvent = mongoose.model('AnalyticsEvent', schema);
