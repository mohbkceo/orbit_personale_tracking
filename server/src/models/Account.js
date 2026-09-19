import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['cash', 'bank', 'savings', 'wallet', 'other'], required: true },
    currency: { type: String, uppercase: true, trim: true, default: 'DZD', maxlength: 3 },
    openingBalance: { type: Number, default: 0 },
    icon: { type: String, default: 'wallet' },
    color: { type: String, default: '#1d4ed8' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

accountSchema.index({ user: 1, name: 1, archived: 1 });
export const Account = mongoose.model('Account', accountSchema);
