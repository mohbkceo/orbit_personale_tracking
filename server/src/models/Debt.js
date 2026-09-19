import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, default: Date.now },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

const debtSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    personName: { type: String, required: true, trim: true, maxlength: 120 },
    personId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null, index: true },
    type: { type: String, enum: ['receivable', 'payable'], required: true, index: true },
    originalAmount: { type: Number, required: true, min: 0.01 },
    remainingAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'DZD', uppercase: true, maxlength: 3 },
    description: { type: String, default: '' },
    date: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null, index: true },
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'overdue'], default: 'unpaid', index: true },
    payments: [paymentSchema],
    createdVia: { type: String, enum: ['web', 'telegram', 'system'], default: 'web' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

debtSchema.index({ personName: 'text', description: 'text' });
export const Debt = mongoose.model('Debt', debtSchema);
