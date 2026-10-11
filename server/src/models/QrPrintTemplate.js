import mongoose from 'mongoose';
import { templateAssetIds, templateInput } from '../validators/qrPrintTemplate.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  widthMm: { type: Number, required: true, default: 97 },
  heightMm: { type: Number, required: true, default: 55 },
  background: { type: mongoose.Schema.Types.Mixed, required: true },
  elements: { type: [mongoose.Schema.Types.Mixed], required: true },
  assetRefs: { type: [String], default: [], index: true },
  version: { type: Number, required: true, default: 1 },
  createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });
schema.pre('validate', function validateTemplate(next) {
  const result = templateInput.safeParse({ name: this.name, widthMm: this.widthMm, heightMm: this.heightMm, background: this.background, elements: this.elements });
  if (!result.success) this.invalidate('elements', 'Invalid print template');
  else this.assetRefs = templateAssetIds(result.data);
  next();
});
export const QrPrintTemplate = mongoose.model('QrPrintTemplate', schema);
