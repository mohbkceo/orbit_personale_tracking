import mongoose from 'mongoose';

const recurrenceSchema = new mongoose.Schema(
  { frequency: String, interval: { type: Number, default: 1 }, dayOfMonth: Number, daysOfWeek: [Number], startDate: Date, endDate: Date },
  { _id: false },
);

const billSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, default: 'Bills' }, accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    dueDate: { type: Date, required: true, index: true }, recurrence: recurrenceSchema,
    status: { type: String, enum: ['upcoming', 'due', 'paid', 'overdue'], default: 'upcoming', index: true },
    autoCreateExpense: { type: Boolean, default: true }, notes: String,
  }, { timestamps: true },
);

const subscriptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'DZD' }, billingCycle: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'], default: 'monthly' },
    nextBillingDate: { type: Date, required: true, index: true }, accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    category: { type: String, default: 'Subscriptions' }, status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
    website: String, notes: String,
  }, { timestamps: true },
);

const goalSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true }, description: String,
    type: { type: String, enum: ['financial', 'personal'], default: 'financial' }, targetAmount: { type: Number, min: 0 },
    currentAmount: { type: Number, min: 0, default: 0 }, accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    targetDate: Date, status: { type: String, enum: ['active', 'completed', 'paused', 'cancelled'], default: 'active' }, notes: String,
  }, { timestamps: true },
);

billSchema.index({ name: 'text', category: 'text' });
subscriptionSchema.index({ name: 'text', category: 'text' });
goalSchema.index({ title: 'text', description: 'text' });

export const Bill = mongoose.model('Bill', billSchema);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export const Goal = mongoose.model('Goal', goalSchema);
