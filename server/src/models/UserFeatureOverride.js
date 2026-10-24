import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  enabled: { type: Boolean, required: true },
  limit: Number,
  value: String,
  reason: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
}, { timestamps: true });
schema.index({ user: 1, key: 1 }, { unique: true });
export const UserFeatureOverride = mongoose.model('UserFeatureOverride', schema);
