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
    reminders: {
      enabled: { type: Boolean, default: true },
      automaticEnabled: { type: Boolean, default: true },
      activeHours: { start: { type: String, default: '08:00' }, end: { type: String, default: '22:00' } },
      quietHours: { enabled: { type: Boolean, default: true }, start: { type: String, default: '22:00' }, end: { type: String, default: '08:00' } },
      incompleteFollowUpsEnabled: { type: Boolean, default: true },
      maxAutomaticFollowUps: { type: Number, default: 2, min: 0, max: 5 },
      minimumReminderSpacingMinutes: { type: Number, default: 120, min: 0, max: 1440 },
      defaultEntityModes: {
        task: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
        debt: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
        bill: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
        subscription: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
        goal: { type: String, enum: ['automatic', 'custom', 'off'], default: 'automatic' },
      },
      deliveryChannels: { telegram: { type: Boolean, default: true }, web: { type: Boolean, default: true } },
    },
  },
  { timestamps: true },
);

export const Setting = mongoose.model('Setting', settingSchema);
