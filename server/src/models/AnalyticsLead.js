import mongoose from 'mongoose';
import { touchSchema } from './AnalyticsVisitor.js';

const schema = new mongoose.Schema({
  leadCode: { type: String, required: true, unique: true }, visitorId: { type: String, required: true, index: true }, sessionId: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }, source: { type: String, enum: ['whatsapp'], required: true },
  firstTouch: touchSchema, lastTouch: touchSchema, lastNonDirectTouch: touchSchema,
  status: { type: String, enum: ['CREATED', 'CONTACT_STARTED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'], default: 'CONTACT_STARTED', index: true },
  activationLink: { type: mongoose.Schema.Types.ObjectId, ref: 'ActivationLink', index: true }, convertedAt: Date,
}, { timestamps: true });
schema.index({ createdAt: -1, source: 1 });
schema.index({ sessionId: 1, source: 1 }, { unique: true });
export const AnalyticsLead = mongoose.model('AnalyticsLead', schema);
