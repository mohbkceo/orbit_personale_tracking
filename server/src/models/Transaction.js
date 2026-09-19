import mongoose from 'mongoose';

export const TRANSACTION_TYPES = [
  'expense',
  'income',
  'transfer',
  'debt_payment_in',
  'debt_payment_out',
  'savings_contribution',
  'savings_withdrawal',
  'adjustment',
];

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
    destinationAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    category: { type: String, trim: true, default: 'Other', index: true },
    description: { type: String, trim: true, required: true, maxlength: 240 },
    date: { type: Date, default: Date.now, index: true },
    sourceEntityType: { type: String, default: null },
    sourceEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdVia: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
    tags: [{ type: String, trim: true }],
    notes: { type: String, maxlength: 2000, default: '' },
    recurring: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

transactionSchema.index({ user: 1, date: -1, type: 1, accountId: 1 });
transactionSchema.index({ description: 'text', category: 'text', tags: 'text' });
export const Transaction = mongoose.model('Transaction', transactionSchema);
