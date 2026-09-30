import crypto from 'node:crypto';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { hashPassword } from '../services/authService.js';

import { User } from '../models/User.js';
import { Admin } from '../models/Admin.js';
import { Plan } from '../models/Plan.js';
import { ActivationLink } from '../models/ActivationLink.js';
import { AccessSubscription } from '../models/AccessSubscription.js';

import { Account } from '../models/Account.js';
import { Transaction } from '../models/Transaction.js';
import { Debt } from '../models/Debt.js';
import { Task } from '../models/Task.js';
import { Bill, Subscription, Goal } from '../models/Planning.js';
import { Contact, Project, Note, Habit, Wishlist } from '../models/Personal.js';

import { DailyFocus } from '../models/DailyFocus.js';
import { Setting } from '../models/Setting.js';
import { Activity } from '../models/Activity.js';
import { Reminder } from '../models/Reminder.js';
import { ReminderEvent } from '../models/ReminderEvent.js';

// ============================================================
// CONFIG
// ============================================================

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@orbit.tooutdo.com').trim().toLowerCase();

const DEMO_FULL_NAME = process.env.DEMO_FULL_NAME || 'Yacine Benali';

// If no password is provided, generate one every run.
const DEMO_PASSWORD =
  process.env.DEMO_PASSWORD || `Orbit-${crypto.randomBytes(8).toString('base64url')}!`;

const TIMEZONE = 'Africa/Algiers';
const CURRENCY = 'DZD';

const now = new Date();
const DAY = 24 * 60 * 60 * 1000;

// ============================================================
// DATE HELPERS
// ============================================================

function daysFromNow(days, hour = 12) {
  const date = new Date(now.getTime() + days * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function monthDate(monthsBack, day = 10) {
  const date = new Date();

  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  date.setUTCDate(day);
  date.setUTCHours(12, 0, 0, 0);

  return date;
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDuration(date, value, unit) {
  const result = new Date(date);

  switch (unit) {
    case 'HOUR':
      return new Date(result.getTime() + value * 60 * 60 * 1000);

    case 'DAY':
      return new Date(result.getTime() + value * DAY);

    case 'WEEK':
      return new Date(result.getTime() + value * 7 * DAY);

    case 'MONTH':
      result.setUTCMonth(result.getUTCMonth() + value);
      return result;

    case 'YEAR':
      result.setUTCFullYear(result.getUTCFullYear() + value);
      return result;

    default:
      throw new Error(`Unsupported plan duration unit: ${unit}`);
  }
}

// ============================================================
// CLEANUP
// ============================================================

async function removeExistingDemo() {
  const existing = await User.findOne({ email: DEMO_EMAIL });

  if (!existing) return;

  const userId = existing._id;

  console.log(`Removing existing demo account: ${DEMO_EMAIL}`);

  await Promise.all([
    ReminderEvent.deleteMany({ user: userId }),
    Reminder.deleteMany({ user: userId }),

    DailyFocus.deleteMany({ user: userId }),
    Activity.deleteMany({ user: userId }),

    Transaction.deleteMany({ user: userId }),
    Debt.deleteMany({ user: userId }),
    Task.deleteMany({ user: userId }),

    Bill.deleteMany({ user: userId }),
    Subscription.deleteMany({ user: userId }),
    Goal.deleteMany({ user: userId }),

    Contact.deleteMany({ user: userId }),
    Project.deleteMany({ user: userId }),
    Note.deleteMany({ user: userId }),
    Habit.deleteMany({ user: userId }),
    Wishlist.deleteMany({ user: userId }),

    Setting.deleteMany({ user: userId }),
    Account.deleteMany({ user: userId }),

    AccessSubscription.deleteMany({ user: userId }),
  ]);

  await ActivationLink.deleteMany({
    $or: [{ activatedUser: userId }, { reservedByUser: userId }, { intendedUser: userId }],
  });

  await User.deleteOne({ _id: userId });
}

// ============================================================
// MAIN
// ============================================================

async function run() {
  await connectDatabase();

  console.log('');
  console.log('===================================');
  console.log(' ORBIT ADS DEMO ACCOUNT SEED');
  console.log('===================================');
  console.log('');

  // ----------------------------------------------------------
  // Required system data
  // ----------------------------------------------------------

  const admin =
    (await Admin.findOne({
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    })) ||
    (await Admin.findOne({
      status: 'ACTIVE',
    }));

  if (!admin) {
    throw new Error('No active admin found. Run bootstrap:admin first.');
  }

  const plusPlan = await Plan.findOne({
    slug: 'plus',
    status: 'ACTIVE',
  }).populate('features.feature');

  if (!plusPlan) {
    throw new Error('Plus plan not found. Run seedPlansAndFeatures.js first.');
  }

  // ----------------------------------------------------------
  // Clean previous demo
  // ----------------------------------------------------------

  await removeExistingDemo();

  // ----------------------------------------------------------
  // User
  // ----------------------------------------------------------

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const user = await User.create({
    fullName: DEMO_FULL_NAME,
    email: DEMO_EMAIL,
    passwordHash,
    status: 'ACTIVE',
    onboardingCompletedAt: now,
    lastLoginAt: now,
    accessVersion: 1,
  });

  // ----------------------------------------------------------
  // PLUS access
  // ----------------------------------------------------------

  const rawToken = crypto.randomBytes(32).toString('hex');

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const activationLink = await ActivationLink.create({
    tokenHash,

    plan: plusPlan._id,

    planSnapshot: {
      name: plusPlan.name,
      durationValue: plusPlan.durationValue,
      durationUnit: plusPlan.durationUnit,
    },

    status: 'USED',

    createdByAdmin: admin._id,

    activatedAt: now,
    activatedUser: user._id,

    reservedByUser: user._id,
    intendedUser: user._id,

    expiresAt: addDuration(now, 10, 'YEAR'),

    note: 'Dedicated Orbit Ads demo account',
  });

  const subscriptionExpiresAt = addDuration(now, plusPlan.durationValue, plusPlan.durationUnit);

  await AccessSubscription.create({
    user: user._id,
    plan: plusPlan._id,
    activationLink: activationLink._id,

    startedAt: now,
    activatedAt: now,
    expiresAt: subscriptionExpiresAt,

    status: 'ACTIVE',

    planSnapshot: {
      name: plusPlan.name,
      durationValue: plusPlan.durationValue,
      durationUnit: plusPlan.durationUnit,

      features: plusPlan.features
        .filter((entry) => entry.feature)
        .map((entry) => ({
          key: entry.feature.key,
          type: entry.feature.type,
          enabled: entry.enabled,
          limit: entry.limit ?? null,
          value: entry.value || '',
        })),
    },
  });

  // ----------------------------------------------------------
  // Accounts
  // ----------------------------------------------------------

  const [cash, bank, savings] = await Account.create([
    {
      user: user._id,
      name: 'Cash',
      type: 'cash',
      currency: CURRENCY,
      openingBalance: 15_000,
      icon: 'wallet',
      color: '#84CC16',
    },

    {
      user: user._id,
      name: 'Main Bank',
      type: 'bank',
      currency: CURRENCY,
      openingBalance: 75_000,
      icon: 'building-columns',
      color: '#173D30',
    },

    {
      user: user._id,
      name: 'Savings',
      type: 'savings',
      currency: CURRENCY,
      openingBalance: 120_000,
      icon: 'piggy-bank',
      color: '#2563EB',
    },
  ]);

  // ----------------------------------------------------------
  // Settings
  // ----------------------------------------------------------

  await Setting.create({
    user: user._id,

    name: 'My Orbit',
    timezone: TIMEZONE,
    defaultCurrency: CURRENCY,
    dateFormat: 'DD MMM YYYY',
    weekStartsOn: 1,
    theme: 'light',

    telegram: {
      defaultExpenseAccount: cash._id,
      defaultIncomeAccount: bank._id,

      dailySummaryEnabled: false,
      morningSummaryEnabled: false,
    },

    reminders: {
      enabled: true,
      automaticEnabled: true,

      activeHours: {
        start: '08:00',
        end: '22:00',
      },

      quietHours: {
        enabled: true,
        start: '22:00',
        end: '08:00',
      },

      incompleteFollowUpsEnabled: true,
      maxAutomaticFollowUps: 2,
      minimumReminderSpacingMinutes: 120,

      deliveryChannels: {
        telegram: true,
        web: true,
      },
    },
  });

  // ----------------------------------------------------------
  // Projects
  // ----------------------------------------------------------

  const [businessProject, universityProject] = await Project.create([
    {
      user: user._id,
      name: 'Launch Online Store',
      description: 'Prepare and launch my new online business.',
      status: 'active',
      startDate: daysFromNow(-25),
      targetDate: daysFromNow(30),
      tags: ['business', 'launch'],
    },

    {
      user: user._id,
      name: 'University Semester',
      description: 'Stay ahead on lectures, assignments and exams.',
      status: 'active',
      startDate: daysFromNow(-40),
      targetDate: daysFromNow(75),
      tags: ['university', 'study'],
    },
  ]);

  // ----------------------------------------------------------
  // Tasks
  // ----------------------------------------------------------

  const tasks = await Task.create([
    {
      user: user._id,
      title: 'Finish online store landing page',
      description: 'Complete the hero, products section and checkout CTA.',
      status: 'in_progress',
      priority: 'high',
      dueDate: daysFromNow(0, 17),
      dueTime: '18:00',
      category: 'Business',
      projectId: businessProject._id,
      tags: ['store', 'launch'],
      nextAction: 'Finish mobile responsive section',
      estimatedMinutes: 90,
      executionState: 'started',
      startedAt: daysFromNow(0, 9),
      lastProgressAt: daysFromNow(0, 10),
      startCount: 2,
      createdVia: 'web',
    },

    {
      user: user._id,
      title: 'Reply to pending clients',
      description: 'Reply to the 3 client conversations.',
      status: 'todo',
      priority: 'high',
      dueDate: daysFromNow(0, 18),
      dueTime: '19:00',
      category: 'Work',
      estimatedMinutes: 30,
      executionState: 'planned',
      createdVia: 'telegram',
    },

    {
      user: user._id,
      title: 'Review Electronics chapter',
      description: 'Review chapter 4 and solve exercises.',
      status: 'todo',
      priority: 'medium',
      dueDate: daysFromNow(1, 17),
      dueTime: '18:00',
      category: 'University',
      projectId: universityProject._id,
      estimatedMinutes: 75,
      executionState: 'planned',
      createdVia: 'web',
    },

    {
      user: user._id,
      title: "Plan next week's budget",
      status: 'todo',
      priority: 'medium',
      dueDate: daysFromNow(2, 19),
      category: 'Finance',
      estimatedMinutes: 20,
      createdVia: 'web',
    },

    {
      user: user._id,
      title: 'Prepare product photos',
      status: 'todo',
      priority: 'high',
      dueDate: daysFromNow(3, 16),
      category: 'Business',
      projectId: businessProject._id,
      estimatedMinutes: 60,
      createdVia: 'telegram',
    },

    {
      user: user._id,
      title: 'Renew hosting',
      status: 'todo',
      priority: 'urgent',
      dueDate: daysFromNow(-1, 18),
      category: 'Business',
      projectId: businessProject._id,
      estimatedMinutes: 10,
      createdVia: 'web',
    },

    {
      user: user._id,
      title: 'Submit university assignment',
      status: 'completed',
      priority: 'high',
      dueDate: daysFromNow(-2, 14),
      category: 'University',
      projectId: universityProject._id,
      completedAt: daysFromNow(-2, 12),
      executionState: 'completed',
      createdVia: 'web',
    },

    {
      user: user._id,
      title: 'Send supplier payment',
      status: 'completed',
      priority: 'high',
      dueDate: daysFromNow(-3),
      category: 'Business',
      projectId: businessProject._id,
      completedAt: daysFromNow(-3, 10),
      executionState: 'completed',
      createdVia: 'telegram',
    },

    {
      user: user._id,
      title: '30 minute workout',
      status: 'completed',
      priority: 'medium',
      dueDate: daysFromNow(0, 7),
      category: 'Health',
      completedAt: daysFromNow(0, 8),
      executionState: 'completed',
      createdVia: 'web',
    },

    {
      user: user._id,
      title: 'Organize study notes',
      status: 'completed',
      priority: 'low',
      dueDate: daysFromNow(-5),
      category: 'University',
      projectId: universityProject._id,
      completedAt: daysFromNow(-5),
      executionState: 'completed',
      createdVia: 'web',
    },
  ]);

  // ----------------------------------------------------------
  // Daily Focus
  // ----------------------------------------------------------

  await DailyFocus.create({
    user: user._id,
    date: todayKey(),
    timezone: TIMEZONE,

    items: [
      {
        task: tasks[0]._id,
        position: 1,
        source: 'web',
      },
      {
        task: tasks[1]._id,
        position: 2,
        source: 'web',
      },
      {
        task: tasks[8]._id,
        position: 3,
        source: 'web',
      },
    ],

    planningStartedAt: daysFromNow(0, 7),
    planningCompleted: true,
    source: 'web',
  });

  // ----------------------------------------------------------
  // Transactions — historical graph
  // ----------------------------------------------------------

  const historicalTransactions = [];

  const monthlyHistory = [
    {
      monthsBack: 5,
      income: 48_000,
      expenses: [
        ['Food', 8_500],
        ['Transport', 4_000],
        ['Education', 6_000],
      ],
    },

    {
      monthsBack: 4,
      income: 61_000,
      expenses: [
        ['Food', 9_200],
        ['Transport', 4_500],
        ['Technology', 12_000],
      ],
    },

    {
      monthsBack: 3,
      income: 57_500,
      expenses: [
        ['Food', 8_900],
        ['Transport', 4_100],
        ['Shopping', 9_500],
      ],
    },

    {
      monthsBack: 2,
      income: 72_000,
      expenses: [
        ['Food', 10_500],
        ['Transport', 5_300],
        ['Education', 7_000],
        ['Subscriptions', 3_200],
      ],
    },

    {
      monthsBack: 1,
      income: 84_000,
      expenses: [
        ['Food', 11_200],
        ['Transport', 5_500],
        ['Technology', 14_500],
        ['Subscriptions', 3_500],
      ],
    },
  ];

  for (const month of monthlyHistory) {
    historicalTransactions.push({
      user: user._id,
      type: 'income',
      amount: month.income,
      accountId: bank._id,
      category: 'Freelance',
      description: 'Freelance client payments',
      date: monthDate(month.monthsBack, 6),
      createdVia: 'web',
      tags: ['work'],
    });

    month.expenses.forEach(([category, amount], index) => {
      historicalTransactions.push({
        user: user._id,
        type: 'expense',
        amount,
        accountId: bank._id,
        category,
        description: `${category} expenses`,
        date: monthDate(month.monthsBack, 10 + index * 4),
        createdVia: index % 2 ? 'telegram' : 'web',
      });
    });
  }

  await Transaction.insertMany(historicalTransactions);

  // ----------------------------------------------------------
  // Transactions — current month
  // ----------------------------------------------------------

  const currentTransactions = await Transaction.create([
    {
      user: user._id,
      type: 'income',
      amount: 32_000,
      accountId: bank._id,
      category: 'Sale',
      description: 'Landing page project',
      date: daysFromNow(-6),
      createdVia: 'web',

      saleDetails: {
        business: 'Freelance',
        product: 'Landing Page',
        quantity: 1,
        customerName: 'Atlas Store',
      },
    },

    {
      user: user._id,
      type: 'income',
      amount: 18_500,
      accountId: cash._id,
      category: 'Sale',
      description: 'Branding package',
      date: daysFromNow(-3),
      createdVia: 'telegram',

      saleDetails: {
        business: 'Freelance',
        product: 'Brand Identity',
        quantity: 1,
        customerName: 'Nour Shop',
      },
    },

    {
      user: user._id,
      type: 'income',
      amount: 24_000,
      accountId: bank._id,
      category: 'Freelance',
      description: 'Client project payment',
      date: daysFromNow(-1),
      createdVia: 'telegram',
    },

    {
      user: user._id,
      type: 'expense',
      amount: 850,
      accountId: cash._id,
      category: 'Food',
      description: 'Lunch',
      date: daysFromNow(0, 12),
      createdVia: 'telegram',
    },

    {
      user: user._id,
      type: 'expense',
      amount: 1_200,
      accountId: cash._id,
      category: 'Transport',
      description: 'Transport this week',
      date: daysFromNow(0, 10),
      createdVia: 'telegram',
    },

    {
      user: user._id,
      type: 'expense',
      amount: 3_800,
      accountId: bank._id,
      category: 'Subscriptions',
      description: 'Software subscriptions',
      date: daysFromNow(-2),
      createdVia: 'web',
    },

    {
      user: user._id,
      type: 'expense',
      amount: 6_500,
      accountId: bank._id,
      category: 'Education',
      description: 'University materials',
      date: daysFromNow(-5),
      createdVia: 'web',
    },

    {
      user: user._id,
      type: 'expense',
      amount: 4_900,
      accountId: bank._id,
      category: 'Technology',
      description: 'Accessories',
      date: daysFromNow(-8),
      createdVia: 'web',
    },

    {
      user: user._id,
      type: 'transfer',
      amount: 20_000,
      accountId: bank._id,
      destinationAccountId: savings._id,
      category: 'Savings',
      description: 'Monthly savings',
      date: daysFromNow(-4),
      createdVia: 'web',
    },
  ]);

  // ----------------------------------------------------------
  // Debts
  // ----------------------------------------------------------

  await Debt.create([
    {
      user: user._id,

      personName: 'Ahmed',
      type: 'receivable',

      originalAmount: 12_500,
      remainingAmount: 7_000,

      currency: CURRENCY,

      description: 'Shared project expenses',

      date: daysFromNow(-14),
      dueDate: daysFromNow(6),

      status: 'partial',

      payments: [
        {
          amount: 5_500,
          date: daysFromNow(-5),
          accountId: cash._id,
          notes: 'First payment',
        },
      ],

      createdVia: 'telegram',
    },

    {
      user: user._id,

      personName: 'Karim',
      type: 'payable',

      originalAmount: 4_500,
      remainingAmount: 4_500,

      currency: CURRENCY,

      description: 'Equipment purchase',

      date: daysFromNow(-7),
      dueDate: daysFromNow(5),

      status: 'unpaid',

      createdVia: 'telegram',
    },

    {
      user: user._id,

      personName: 'Nour Shop',
      type: 'receivable',

      originalAmount: 18_000,
      remainingAmount: 18_000,

      currency: CURRENCY,

      description: 'Remaining project payment',

      date: daysFromNow(-4),
      dueDate: daysFromNow(10),

      status: 'unpaid',

      createdVia: 'web',
    },
  ]);

  // ----------------------------------------------------------
  // Goals
  // ----------------------------------------------------------

  const goals = await Goal.create([
    {
      user: user._id,

      title: 'Emergency Fund',
      description: 'Build a 300,000 DZD safety fund.',

      type: 'financial',

      targetAmount: 300_000,
      currentAmount: 172_000,

      accountId: savings._id,

      targetDate: daysFromNow(150),

      status: 'active',
    },

    {
      user: user._id,

      title: 'Buy MacBook Air',
      description: 'Save for a new work laptop.',

      type: 'financial',

      targetAmount: 260_000,
      currentAmount: 95_000,

      accountId: savings._id,

      targetDate: daysFromNow(210),

      status: 'active',
    },

    {
      user: user._id,

      title: 'Finish semester strong',
      description: 'Stay consistent with lectures and assignments.',

      type: 'personal',

      currentAmount: 0,

      targetDate: daysFromNow(75),

      status: 'active',
    },
  ]);

  // ----------------------------------------------------------
  // Bills
  // ----------------------------------------------------------

  await Bill.create([
    {
      user: user._id,

      name: 'Home Internet',
      amount: 3_500,

      category: 'Bills',
      accountId: bank._id,

      dueDate: daysFromNow(4),

      status: 'upcoming',

      recurrence: {
        frequency: 'monthly',
        interval: 1,
        startDate: daysFromNow(4),
      },

      autoCreateExpense: true,
    },

    {
      user: user._id,

      name: 'Phone Plan',
      amount: 1_500,

      category: 'Bills',
      accountId: bank._id,

      dueDate: daysFromNow(9),

      status: 'upcoming',

      recurrence: {
        frequency: 'monthly',
        interval: 1,
        startDate: daysFromNow(9),
      },

      autoCreateExpense: true,
    },

    {
      user: user._id,

      name: 'Website Hosting',
      amount: 4_200,

      category: 'Business',
      accountId: bank._id,

      dueDate: daysFromNow(15),

      status: 'upcoming',

      autoCreateExpense: true,
    },
  ]);

  // ----------------------------------------------------------
  // Subscriptions
  // ----------------------------------------------------------

  await Subscription.create([
    {
      user: user._id,

      name: 'Design Software',
      amount: 2_400,
      currency: CURRENCY,

      billingCycle: 'monthly',
      nextBillingDate: daysFromNow(6),

      accountId: bank._id,

      category: 'Subscriptions',
      status: 'active',
    },

    {
      user: user._id,

      name: 'Cloud Storage',
      amount: 1_200,
      currency: CURRENCY,

      billingCycle: 'monthly',
      nextBillingDate: daysFromNow(12),

      accountId: bank._id,

      category: 'Subscriptions',
      status: 'active',
    },
  ]);

  // ----------------------------------------------------------
  // Contacts
  // ----------------------------------------------------------

  await Contact.create([
    {
      user: user._id,
      name: 'Ahmed',
      phone: '0550 00 00 01',
      notes: 'Friend and project collaborator',
      tags: ['friend', 'work'],
    },

    {
      user: user._id,
      name: 'Karim',
      phone: '0660 00 00 02',
      notes: 'Supplier contact',
      tags: ['supplier'],
    },

    {
      user: user._id,
      name: 'Nour Shop',
      phone: '0770 00 00 03',
      notes: 'Client',
      tags: ['client'],
    },
  ]);

  // ----------------------------------------------------------
  // Notes
  // ----------------------------------------------------------

  await Note.create([
    {
      user: user._id,

      title: 'This week',
      content:
        'Focus on the store launch, finish university work early and keep expenses under control.',

      tags: ['weekly', 'focus'],

      pinned: true,
    },

    {
      user: user._id,

      title: 'Business ideas',
      content: 'Test short-form ads, improve the landing page and collect customer feedback.',

      tags: ['business', 'ideas'],

      pinned: false,
    },
  ]);

  // ----------------------------------------------------------
  // Habits
  // ----------------------------------------------------------

  await Habit.create([
    {
      user: user._id,

      name: 'Read 20 minutes',
      frequency: 'daily',
      target: 1,
      active: true,

      logs: [
        { date: daysFromNow(-6), value: 1 },
        { date: daysFromNow(-5), value: 1 },
        { date: daysFromNow(-4), value: 1 },
        { date: daysFromNow(-2), value: 1 },
        { date: daysFromNow(-1), value: 1 },
        { date: daysFromNow(0), value: 1 },
      ],
    },

    {
      user: user._id,

      name: 'Workout',
      frequency: 'weekdays',
      target: 1,
      active: true,

      logs: [
        { date: daysFromNow(-6), value: 1 },
        { date: daysFromNow(-4), value: 1 },
        { date: daysFromNow(-2), value: 1 },
        { date: daysFromNow(0), value: 1 },
      ],
    },
  ]);

  // ----------------------------------------------------------
  // Wishlist
  // ----------------------------------------------------------

  await Wishlist.create([
    {
      user: user._id,

      name: 'MacBook Air',

      expectedPrice: 260_000,

      priority: 'high',
      category: 'Technology',

      targetDate: daysFromNow(210),

      status: 'saving',

      notes: 'For development and freelance work.',

      goalId: goals[1]._id,
    },

    {
      user: user._id,

      name: 'Noise cancelling headphones',

      expectedPrice: 28_000,

      priority: 'medium',
      category: 'Technology',

      status: 'wanted',
    },
  ]);

  // ----------------------------------------------------------
  // Reminders
  // Web only — avoids sending anything to a fake Telegram chat.
  // ----------------------------------------------------------

  const reminders = await Reminder.create([
    {
      user: user._id,

      title: 'Finish landing page',
      message: 'One focused session. Finish the responsive section.',

      source: 'custom',
      entityType: 'task',
      entityId: tasks[0]._id,

      purpose: 'act',

      trigger: {
        type: 'datetime',
        at: daysFromNow(0, 20),
        timezone: TIMEZONE,
      },

      priority: 'high',
      mode: 'custom',
      status: 'scheduled',

      nextTriggerAt: daysFromNow(0, 20),

      deliveryChannels: ['web'],
    },

    {
      user: user._id,

      title: 'Review Electronics',
      message: 'Start with chapter 4 exercises.',

      source: 'custom',
      entityType: 'task',
      entityId: tasks[2]._id,

      purpose: 'prepare',

      trigger: {
        type: 'datetime',
        at: daysFromNow(1, 16),
        timezone: TIMEZONE,
      },

      priority: 'medium',
      mode: 'custom',
      status: 'scheduled',

      nextTriggerAt: daysFromNow(1, 16),

      deliveryChannels: ['web'],
    },
  ]);

  await ReminderEvent.create([
    {
      user: user._id,
      reminderId: reminders[0]._id,
      eventType: 'scheduled',
      channel: 'web',
    },

    {
      user: user._id,
      reminderId: reminders[1]._id,
      eventType: 'scheduled',
      channel: 'web',
    },
  ]);

  // ----------------------------------------------------------
  // Activity feed
  // ----------------------------------------------------------

  await Activity.create([
    {
      user: user._id,
      action: 'created',
      entityType: 'Transaction',
      entityId: currentTransactions[3]._id,
      description: 'expense · Lunch',
      source: 'telegram',
    },

    {
      user: user._id,
      action: 'completed',
      entityType: 'Task',
      entityId: tasks[8]._id,
      description: 'Completed 30 minute workout',
      source: 'web',
    },

    {
      user: user._id,
      action: 'created',
      entityType: 'Transaction',
      entityId: currentTransactions[2]._id,
      description: 'income · Client project payment',
      source: 'telegram',
    },

    {
      user: user._id,
      action: 'created',
      entityType: 'Task',
      entityId: tasks[1]._id,
      description: 'Created Reply to pending clients',
      source: 'telegram',
    },

    {
      user: user._id,
      action: 'created',
      entityType: 'Goal',
      entityId: goals[1]._id,
      description: 'Created goal · Buy MacBook Air',
      source: 'web',
    },

    {
      user: user._id,
      action: 'updated',
      entityType: 'Project',
      entityId: businessProject._id,
      description: 'Updated Launch Online Store',
      source: 'web',
    },
  ]);

  // ----------------------------------------------------------
  // Done
  // ----------------------------------------------------------

  console.log('');
  console.log('===================================');
  console.log(' DEMO ACCOUNT READY');
  console.log('===================================');
  console.log('');
  console.log(`Name:     ${DEMO_FULL_NAME}`);
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Plan:     ${plusPlan.name}`);
  console.log(`Expires:  ${subscriptionExpiresAt.toISOString()}`);
  console.log('');
  console.log('Demo data:');
  console.log('  ✓ Plus access');
  console.log('  ✓ 3 financial accounts');
  console.log('  ✓ 6 months financial history');
  console.log('  ✓ Sales & expenses');
  console.log('  ✓ Debts');
  console.log('  ✓ Tasks');
  console.log('  ✓ Daily Focus');
  console.log('  ✓ Projects');
  console.log('  ✓ Goals');
  console.log('  ✓ Bills');
  console.log('  ✓ Subscriptions');
  console.log('  ✓ Contacts');
  console.log('  ✓ Notes');
  console.log('  ✓ Habits');
  console.log('  ✓ Wishlist');
  console.log('  ✓ Reminders');
  console.log('  ✓ Activity feed');
  console.log('');
}

try {
  await run();
} catch (error) {
  console.error('');
  console.error('Demo seed failed:');
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
