import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  version: { type: Number, default: 1 },
  seededAt: Date,
}, { timestamps: true });

export const AccessConfiguration = mongoose.model('AccessConfiguration', schema);
