import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, default: 'My workspace' },
    timezone: { type: String, default: 'Africa/Algiers' },
    defaultCurrency: { type: String, default: 'DZD', uppercase: true },
    dateFormat: { type: String, default: 'DD MMM YYYY' },
    weekStartsOn: { type: Number, default: 1 },
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    expenseCategories: { type: [String], default: ['Food', 'Transport', 'Shopping', 'Bills', 'Subscriptions', 'Health', 'Education', 'Entertainment', 'Home', 'Technology', 'Travel', 'Gifts', 'Other'] },
    incomeCategories: { type: [String], default: ['Salary', 'Freelance', 'Business', 'Sale', 'Gift', 'Refund', 'Investment', 'Other'] },
    telegram: {
      defaultExpenseAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
      defaultIncomeAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
      dailySummaryEnabled: { type: Boolean, default: false }, dailySummaryTime: { type: String, default: '20:00' },
      morningSummaryEnabled: { type: Boolean, default: false }, morningSummaryTime: { type: String, default: '08:00' },
    },
  },
  { timestamps: true },
);

export const Setting = mongoose.model('Setting', settingSchema);
