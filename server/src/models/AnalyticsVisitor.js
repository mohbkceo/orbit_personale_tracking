import mongoose from 'mongoose';

export const touchSchema = new mongoose.Schema({
  channel: String, utmSource: String, utmMedium: String, utmCampaign: String, utmContent: String, utmTerm: String, utmId: String,
  referrer: String, referrerHost: String, landingPage: String, landingPath: String, clickIds: { type: Map, of: String }, queryParams: { type: Map, of: String }, occurredAt: Date,
}, { _id: false, minimize: false });

const schema = new mongoose.Schema({
  visitorId: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  firstTouch: touchSchema, lastTouch: touchSchema, lastNonDirectTouch: touchSchema,
  firstSeenAt: { type: Date, required: true, index: true }, lastSeenAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ 'firstTouch.utmCampaign': 1, firstSeenAt: -1 });
export const AnalyticsVisitor = mongoose.model('AnalyticsVisitor', schema);
