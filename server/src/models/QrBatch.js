import mongoose from 'mongoose';

const qrBatchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
      unique: true,
      index: true,
    },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    quantity: { type: Number, required: true, min: 1, max: 500 },
    validityDays: { type: Number, required: true, min: 1, max: 365 },
    note: { type: String, maxlength: 500, default: '' },
    qrFormat: { type: String, enum: ['PNG', 'SVG'], required: true, default: 'PNG' },
    qrSize: { type: Number, enum: [512, 1024, 2048], required: true, default: 1024 },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true },
);

export const QrBatch = mongoose.model('QrBatch', qrBatchSchema);
