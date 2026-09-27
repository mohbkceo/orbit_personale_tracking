import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

import { connectDatabase, disconnectDatabase } from '../config/db.js';

import { User } from '../models/User.js';

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

dayjs.extend(utc);
dayjs.extend(timezone);

// ============================================================
// CONFIG
// ============================================================

const DEMO_EMAIL = (process.env.DEMO_EMAIL || 'demo@orbit.tooutdo.com').trim().toLowerCase();

const TIMEZONE = 'Africa/Algiers';
const CURRENCY = 'DZD';

const now = dayjs().tz(TIMEZONE);

// ============================================================
// DATE HELPERS
// ============================================================

function dateFromNow(days = 0, hour = 12, minute = 0) {
  return now.add(days, 'day').hour(hour).minute(minute).second(0).millisecond(0).toDate();
}

function monthDate(monthsBack, day = 10, hour = 12) {
  return now
    .subtract(monthsBack, 'month')
    .date(day)
    .hour(hour)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toDate();
}

function todayKey() {
  return now.format('YYYY-MM-DD');
}

// ============================================================
// CLEAN ONLY USER DATA
// ============================================================

async function clearDemoData(userId) {
  console.log('Cleaning existing demo data...');

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

    Account.deleteMany({ user: userId }),
  ]);

  // IMPORTANT:
  // We deliberately DO NOT touch:
  //
  // User
  // AccessSubscription
  // ActivationLink
  // Plan
  // TelegramConnection
  // authentication/password
}

// ============================================================
// MAIN
// ============================================================

async function run() {
  await connectDatabase();

  console.log('');
  console.log('========================================');
  console.log(' ORBIT — POPULATE EXISTING DEMO ACCOUNT');
  console.log('========================================');
  console.log('');

  // ==========================================================
  // FIND EXISTING USER
  // ==========================================================

  const user = await User.findOne({
    email: DEMO_EMAIL,
  });

  if (!user) {
    throw new Error(
      `Demo account not found: ${DEMO_EMAIL}\n` +
        'This script does NOT create users. Create the account first.',
    );
  }

  console.log(`Account: ${user.fullName}`);
  console.log(`Email:   ${user.email}`);
  console.log(`User ID: ${user._id}`);
  console.log('');

  await clearDemoData(user._id);

  // ==========================================================
  // ACCOUNTS
  // ==========================================================

  console.log('Creating financial accounts...');

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
      openingBalance: 65_000,
      icon: 'building-columns',
      color: '#173D30',
    },

    {
      user: user._id,
      name: 'Savings',
      type: 'savings',
      currency: CURRENCY,
      openingBalance: 110_000,
      icon: 'piggy-bank',
      color: '#2563EB',
    },
  ]);

  // ==========================================================
  // SETTINGS
  // ==========================================================

  await Setting.findOneAndUpdate(
    { user: user._id },

    {
      $set: {
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
          dailySummaryTime: '20:00',

          morningSummaryEnabled: false,
          morningSummaryTime: '08:00',
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

          defaultEntityModes: {
            task: 'automatic',
            debt: 'automatic',
            bill: 'automatic',
            subscription: 'automatic',
            goal: 'automatic',
          },

          deliveryChannels: {
            telegram: true,
            web: true,
          },
        },
      },
    },

    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  // ==========================================================
  // PROJECTS
  // ==========================================================

  console.log('Creating projects...');

  const [storeProject, universityProject, personalProject] = await Project.create([
    {
      user: user._id,

      name: 'Launch Online Store',

      description: 'Build and launch a profitable online product store.',

      status: 'active',

      startDate: dateFromNow(-35),
      targetDate: dateFromNow(30),

      tags: ['business', 'launch', 'ecommerce'],
    },

    {
      user: user._id,

      name: 'University Semester',

      description: 'Stay ahead of lectures, assignments and exam preparation.',

      status: 'active',

      startDate: dateFromNow(-45),
      targetDate: dateFromNow(70),

      tags: ['study', 'university'],
    },

    {
      user: user._id,

      name: 'Personal Upgrade',

      description: 'Improve health, consistency and personal productivity.',

      status: 'active',

      startDate: dateFromNow(-20),
      targetDate: dateFromNow(90),

      tags: ['personal', 'health'],
    },
  ]);

  // ==========================================================
  // TASKS
  // ==========================================================

  console.log('Creating tasks...');

  const tasks = await Task.create([
    {
      user: user._id,

      title: 'Finish online store landing page',

      description: 'Complete the hero section, product benefits and mobile responsive layout.',

      status: 'in_progress',
      priority: 'high',

      dueDate: dateFromNow(0, 18),
      dueTime: '18:00',

      category: 'Business',

      projectId: storeProject._id,

      tags: ['store', 'launch'],

      nextAction: 'Finish mobile responsive section',

      estimatedMinutes: 90,

      startedAt: dateFromNow(0, 9),

      lastStartedAt: dateFromNow(0, 9),

      startCount: 2,

      lastProgressAt: dateFromNow(0, 11),

      executionState: 'started',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Reply to pending clients',

      description: 'Reply to pending customer conversations and confirm orders.',

      status: 'todo',
      priority: 'high',

      dueDate: dateFromNow(0, 19),
      dueTime: '19:00',

      category: 'Work',

      estimatedMinutes: 30,

      executionState: 'planned',

      createdVia: 'telegram',
    },

    {
      user: user._id,

      title: 'Review Electronics chapter',

      description: 'Review chapter 4 and solve the important exercises.',

      status: 'todo',
      priority: 'medium',

      dueDate: dateFromNow(1, 18),
      dueTime: '18:00',

      category: 'University',

      projectId: universityProject._id,

      tags: ['study', 'electronics'],

      estimatedMinutes: 75,

      executionState: 'planned',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: "Plan next week's budget",

      description: 'Review expenses and define a spending limit for next week.',

      status: 'todo',
      priority: 'medium',

      dueDate: dateFromNow(2, 20),

      category: 'Finance',

      estimatedMinutes: 25,

      executionState: 'planned',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Prepare product photos',

      description: 'Prepare clean images for the next advertising campaign.',

      status: 'todo',
      priority: 'high',

      dueDate: dateFromNow(3, 17),

      category: 'Business',

      projectId: storeProject._id,

      estimatedMinutes: 60,

      createdVia: 'telegram',
    },

    {
      user: user._id,

      title: 'Renew website hosting',

      description: 'Renew hosting before the service expires.',

      status: 'todo',
      priority: 'urgent',

      dueDate: dateFromNow(-1, 18),

      category: 'Business',

      projectId: storeProject._id,

      estimatedMinutes: 10,

      executionState: 'idle',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Prepare next ad campaign',

      description: 'Prepare hooks, creatives and campaign structure.',

      status: 'todo',
      priority: 'medium',

      dueDate: dateFromNow(5, 16),

      category: 'Business',

      projectId: storeProject._id,

      estimatedMinutes: 120,

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Submit university assignment',

      status: 'completed',
      priority: 'high',

      dueDate: dateFromNow(-2, 14),

      category: 'University',

      projectId: universityProject._id,

      completedAt: dateFromNow(-2, 12),

      executionState: 'completed',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Send supplier payment',

      status: 'completed',
      priority: 'high',

      dueDate: dateFromNow(-3, 12),

      category: 'Business',

      projectId: storeProject._id,

      completedAt: dateFromNow(-3, 10),

      executionState: 'completed',

      createdVia: 'telegram',
    },

    {
      user: user._id,

      title: '30 minute workout',

      description: 'Complete a focused 30 minute workout.',

      status: 'completed',
      priority: 'medium',

      dueDate: dateFromNow(0, 8),

      category: 'Health',

      projectId: personalProject._id,

      completedAt: dateFromNow(0, 8),

      executionState: 'completed',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Organize study notes',

      status: 'completed',
      priority: 'low',

      dueDate: dateFromNow(-5),

      category: 'University',

      projectId: universityProject._id,

      completedAt: dateFromNow(-5),

      executionState: 'completed',

      createdVia: 'web',
    },

    {
      user: user._id,

      title: 'Weekly planning session',

      status: 'completed',
      priority: 'medium',

      dueDate: dateFromNow(-7),

      category: 'Personal',

      projectId: personalProject._id,

      completedAt: dateFromNow(-7),

      executionState: 'completed',

      createdVia: 'web',
    },
  ]);

  // ==========================================================
  // DAILY FOCUS
  // ==========================================================

  console.log('Creating Daily Focus...');

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
        task: tasks[9]._id,
        position: 3,
        source: 'web',
      },
    ],

    planningStartedAt: dateFromNow(0, 7),

    planningCompleted: true,

    source: 'web',
  });

  // ==========================================================
  // FINANCIAL HISTORY
  // ==========================================================

  console.log('Creating 6 months of financial history...');

  const history = [
    {
      monthsBack: 5,

      incomes: [
        ['Freelance', 37_000, 'Website project'],
        ['Sale', 19_500, 'Product sales'],
      ],

      expenses: [
        ['Food', 8_500, 'Food & coffee'],
        ['Transport', 4_000, 'Transport'],
        ['Education', 6_000, 'Courses and books'],
      ],
    },

    {
      monthsBack: 4,

      incomes: [
        ['Freelance', 42_000, 'Freelance projects'],
        ['Sale', 27_000, 'Online sales'],
      ],

      expenses: [
        ['Food', 9_200, 'Food'],
        ['Transport', 4_500, 'Transport'],
        ['Technology', 12_000, 'Work equipment'],
      ],
    },

    {
      monthsBack: 3,

      incomes: [
        ['Freelance', 41_500, 'Client payments'],
        ['Sale', 25_000, 'Product sales'],
      ],

      expenses: [
        ['Food', 8_900, 'Food'],
        ['Transport', 4_100, 'Transport'],
        ['Shopping', 9_500, 'Shopping'],
      ],
    },

    {
      monthsBack: 2,

      incomes: [
        ['Freelance', 49_000, 'Client projects'],
        ['Sale', 32_000, 'Business sales'],
      ],

      expenses: [
        ['Food', 10_500, 'Food'],
        ['Transport', 5_300, 'Transport'],
        ['Education', 7_000, 'University expenses'],
        ['Subscriptions', 3_200, 'Subscriptions'],
      ],
    },

    {
      monthsBack: 1,

      incomes: [
        ['Freelance', 56_000, 'Freelance clients'],
        ['Sale', 38_000, 'Sales'],
      ],

      expenses: [
        ['Food', 11_200, 'Food'],
        ['Transport', 5_500, 'Transport'],
        ['Technology', 14_500, 'Technology'],
        ['Subscriptions', 3_500, 'Subscriptions'],
      ],
    },
  ];

  const transactionHistory = [];

  for (const month of history) {
    month.incomes.forEach(([category, amount, description], index) => {
      transactionHistory.push({
        user: user._id,

        type: 'income',

        amount,

        accountId: bank._id,

        category,

        description,

        date: monthDate(month.monthsBack, 5 + index * 10),

        createdVia: index % 2 === 0 ? 'web' : 'telegram',

        ...(category === 'Sale'
          ? {
              saleDetails: {
                business: 'Online Business',
                product: 'Customer Order',
                quantity: 1,
                customerName: 'Customer',
              },
            }
          : {}),
      });
    });

    month.expenses.forEach(([category, amount, description], index) => {
      transactionHistory.push({
        user: user._id,

        type: 'expense',

        amount,

        accountId: category === 'Food' || category === 'Transport' ? cash._id : bank._id,

        category,

        description,

        date: monthDate(month.monthsBack, 8 + index * 5),

        createdVia: index % 2 === 0 ? 'telegram' : 'web',
      });
    });
  }

  await Transaction.insertMany(transactionHistory);

  // ==========================================================
  // CURRENT MONTH
  // ==========================================================

  console.log('Creating recent transactions...');

  const recentTransactions = await Transaction.create([
    {
      user: user._id,

      type: 'income',

      amount: 32_000,

      accountId: bank._id,

      category: 'Sale',

      description: 'Landing page project',

      date: dateFromNow(-6),

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

      date: dateFromNow(-3),

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

      date: dateFromNow(-1),

      createdVia: 'telegram',
    },

    {
      user: user._id,

      type: 'income',

      amount: 12_500,

      accountId: cash._id,

      category: 'Sale',

      description: 'Online order sales',

      date: dateFromNow(0, 10),

      createdVia: 'telegram',

      saleDetails: {
        business: 'Online Store',
        product: 'Customer orders',
        quantity: 3,
        customerName: '',
      },
    },

    {
      user: user._id,

      type: 'expense',

      amount: 650,

      accountId: cash._id,

      category: 'Food',

      description: 'Breakfast',

      date: dateFromNow(0, 8),

      createdVia: 'telegram',
    },

    {
      user: user._id,

      type: 'expense',

      amount: 1_200,

      accountId: cash._id,

      category: 'Transport',

      description: 'Transport this week',

      date: dateFromNow(0, 11),

      createdVia: 'telegram',
    },

    {
      user: user._id,

      type: 'expense',

      amount: 3_800,

      accountId: bank._id,

      category: 'Subscriptions',

      description: 'Software subscriptions',

      date: dateFromNow(-2),

      createdVia: 'web',
    },

    {
      user: user._id,

      type: 'expense',

      amount: 6_500,

      accountId: bank._id,

      category: 'Education',

      description: 'University materials',

      date: dateFromNow(-5),

      createdVia: 'web',
    },

    {
      user: user._id,

      type: 'expense',

      amount: 4_900,

      accountId: bank._id,

      category: 'Technology',

      description: 'Work accessories',

      date: dateFromNow(-8),

      createdVia: 'web',
    },

    {
      user: user._id,

      type: 'expense',

      amount: 2_200,

      accountId: cash._id,

      category: 'Shopping',

      description: 'Personal shopping',

      date: dateFromNow(-4),

      createdVia: 'telegram',
    },

    {
      user: user._id,

      type: 'transfer',

      amount: 20_000,

      accountId: bank._id,

      destinationAccountId: savings._id,

      category: 'Savings',

      description: 'Monthly savings',

      date: dateFromNow(-4),

      createdVia: 'web',
    },
  ]);

  // ==========================================================
  // DEBTS
  // ==========================================================

  console.log('Creating debts...');

  await Debt.create([
    {
      user: user._id,

      personName: 'Ahmed',

      type: 'receivable',

      originalAmount: 12_500,
      remainingAmount: 7_000,

      currency: CURRENCY,

      description: 'Shared project expenses',

      date: dateFromNow(-14),

      dueDate: dateFromNow(6),

      reminderMode: 'automatic',

      status: 'partial',

      payments: [
        {
          amount: 5_500,

          date: dateFromNow(-5),

          accountId: cash._id,

          notes: 'First payment received',
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

      date: dateFromNow(-7),

      dueDate: dateFromNow(5),

      reminderMode: 'automatic',

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

      date: dateFromNow(-4),

      dueDate: dateFromNow(10),

      reminderMode: 'automatic',

      status: 'unpaid',

      createdVia: 'web',
    },

    {
      user: user._id,

      personName: 'Walid',

      type: 'receivable',

      originalAmount: 6_000,
      remainingAmount: 6_000,

      currency: CURRENCY,

      description: 'Shared purchase',

      date: dateFromNow(-3),

      dueDate: dateFromNow(12),

      status: 'unpaid',

      createdVia: 'telegram',
    },
  ]);

  // ==========================================================
  // GOALS
  // ==========================================================

  console.log('Creating goals...');

  const goals = await Goal.create([
    {
      user: user._id,

      title: 'Emergency Fund',

      description: 'Build a 300,000 DZD financial safety fund.',

      type: 'financial',

      targetAmount: 300_000,

      currentAmount: 172_000,

      accountId: savings._id,

      targetDate: dateFromNow(150),

      status: 'active',

      reminderMode: 'automatic',
    },

    {
      user: user._id,

      title: 'Buy MacBook Air',

      description: 'Save enough money for a new development laptop.',

      type: 'financial',

      targetAmount: 260_000,

      currentAmount: 95_000,

      accountId: savings._id,

      targetDate: dateFromNow(210),

      status: 'active',

      reminderMode: 'automatic',
    },

    {
      user: user._id,

      title: 'Reach 100 customers',

      description: 'Grow the online business to 100 customers.',

      type: 'personal',

      currentAmount: 0,

      targetDate: dateFromNow(120),

      status: 'active',

      reminderMode: 'automatic',
    },

    {
      user: user._id,

      title: 'Finish semester strong',

      description: 'Stay consistent with university work.',

      type: 'personal',

      currentAmount: 0,

      targetDate: dateFromNow(70),

      status: 'active',

      reminderMode: 'automatic',
    },
  ]);

  // ==========================================================
  // BILLS
  // ==========================================================

  console.log('Creating bills...');

  await Bill.create([
    {
      user: user._id,

      name: 'Home Internet',

      amount: 3_500,

      category: 'Bills',

      accountId: bank._id,

      dueDate: dateFromNow(4),

      recurrence: {
        frequency: 'monthly',
        interval: 1,
        startDate: dateFromNow(4),
      },

      reminderMode: 'automatic',

      status: 'upcoming',

      autoCreateExpense: true,
    },

    {
      user: user._id,

      name: 'Phone Plan',

      amount: 1_500,

      category: 'Bills',

      accountId: bank._id,

      dueDate: dateFromNow(9),

      recurrence: {
        frequency: 'monthly',
        interval: 1,
        startDate: dateFromNow(9),
      },

      reminderMode: 'automatic',

      status: 'upcoming',

      autoCreateExpense: true,
    },

    {
      user: user._id,

      name: 'Website Hosting',

      amount: 4_200,

      category: 'Business',

      accountId: bank._id,

      dueDate: dateFromNow(15),

      reminderMode: 'automatic',

      status: 'upcoming',

      autoCreateExpense: true,
    },

    {
      user: user._id,

      name: 'Domain Renewal',

      amount: 2_800,

      category: 'Business',

      accountId: bank._id,

      dueDate: dateFromNow(24),

      reminderMode: 'automatic',

      status: 'upcoming',

      autoCreateExpense: true,
    },
  ]);

  // ==========================================================
  // SUBSCRIPTIONS
  // ==========================================================

  console.log('Creating subscriptions...');

  await Subscription.create([
    {
      user: user._id,

      name: 'Design Software',

      amount: 2_400,

      currency: CURRENCY,

      billingCycle: 'monthly',

      nextBillingDate: dateFromNow(6),

      accountId: bank._id,

      reminderMode: 'automatic',

      category: 'Subscriptions',

      status: 'active',
    },

    {
      user: user._id,

      name: 'Cloud Storage',

      amount: 1_200,

      currency: CURRENCY,

      billingCycle: 'monthly',

      nextBillingDate: dateFromNow(12),

      accountId: bank._id,

      reminderMode: 'automatic',

      category: 'Subscriptions',

      status: 'active',
    },

    {
      user: user._id,

      name: 'Development Tools',

      amount: 3_000,

      currency: CURRENCY,

      billingCycle: 'monthly',

      nextBillingDate: dateFromNow(18),

      accountId: bank._id,

      reminderMode: 'automatic',

      category: 'Subscriptions',

      status: 'active',
    },
  ]);

  // ==========================================================
  // CONTACTS
  // ==========================================================

  console.log('Creating contacts...');

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

      notes: 'Supplier',

      tags: ['supplier'],
    },

    {
      user: user._id,

      name: 'Nour Shop',

      phone: '0770 00 00 03',

      notes: 'Client',

      tags: ['client'],
    },

    {
      user: user._id,

      name: 'Walid',

      phone: '0555 00 00 04',

      notes: 'Friend',

      tags: ['friend'],
    },
  ]);

  // ==========================================================
  // NOTES
  // ==========================================================

  console.log('Creating notes...');

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

      pinned: true,
    },

    {
      user: user._id,

      title: 'Study priorities',

      content: 'Electronics chapter 4, mathematics exercises and assignment review.',

      tags: ['study'],

      pinned: false,
    },
  ]);

  // ==========================================================
  // HABITS
  // ==========================================================

  console.log('Creating habits...');

  await Habit.create([
    {
      user: user._id,

      name: 'Read 20 minutes',

      frequency: 'daily',

      target: 1,

      active: true,

      logs: [
        { date: dateFromNow(-6), value: 1 },
        { date: dateFromNow(-5), value: 1 },
        { date: dateFromNow(-4), value: 1 },
        { date: dateFromNow(-3), value: 1 },
        { date: dateFromNow(-2), value: 1 },
        { date: dateFromNow(-1), value: 1 },
        { date: dateFromNow(0), value: 1 },
      ],
    },

    {
      user: user._id,

      name: 'Workout',

      frequency: 'weekdays',

      target: 1,

      active: true,

      logs: [
        { date: dateFromNow(-6), value: 1 },
        { date: dateFromNow(-4), value: 1 },
        { date: dateFromNow(-2), value: 1 },
        { date: dateFromNow(0), value: 1 },
      ],
    },

    {
      user: user._id,

      name: 'Review daily expenses',

      frequency: 'daily',

      target: 1,

      active: true,

      logs: [
        { date: dateFromNow(-5), value: 1 },
        { date: dateFromNow(-4), value: 1 },
        { date: dateFromNow(-3), value: 1 },
        { date: dateFromNow(-2), value: 1 },
        { date: dateFromNow(-1), value: 1 },
      ],
    },
  ]);

  // ==========================================================
  // WISHLIST
  // ==========================================================

  console.log('Creating wishlist...');

  await Wishlist.create([
    {
      user: user._id,

      name: 'MacBook Air',

      expectedPrice: 260_000,

      priority: 'high',

      category: 'Technology',

      targetDate: dateFromNow(210),

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

    {
      user: user._id,

      name: 'Standing Desk',

      expectedPrice: 45_000,

      priority: 'medium',

      category: 'Workspace',

      status: 'wanted',
    },
  ]);

  // ==========================================================
  // REMINDERS
  // ==========================================================

  console.log('Creating reminders...');

  // Web only so the demo script never sends messages
  // to a Telegram account accidentally.

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
        at: dateFromNow(0, 20),
        timezone: TIMEZONE,
      },

      priority: 'high',

      mode: 'custom',

      status: 'scheduled',

      requireAcknowledgement: false,

      nextTriggerAt: dateFromNow(0, 20),

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
        at: dateFromNow(1, 16),
        timezone: TIMEZONE,
      },

      priority: 'medium',

      mode: 'custom',

      status: 'scheduled',

      nextTriggerAt: dateFromNow(1, 16),

      deliveryChannels: ['web'],
    },

    {
      user: user._id,

      title: 'Ahmed payment',

      message: 'Follow up on the remaining debt payment.',

      source: 'custom',

      entityType: 'custom',

      purpose: 'follow_up',

      trigger: {
        type: 'datetime',
        at: dateFromNow(5, 18),
        timezone: TIMEZONE,
      },

      priority: 'medium',

      mode: 'custom',

      status: 'scheduled',

      nextTriggerAt: dateFromNow(5, 18),

      deliveryChannels: ['web'],
    },
  ]);

  await ReminderEvent.create(
    reminders.map((reminder) => ({
      user: user._id,

      reminderId: reminder._id,

      eventType: 'scheduled',

      channel: 'web',

      timestamp: new Date(),
    })),
  );

  // ==========================================================
  // ACTIVITY FEED
  // ==========================================================

  console.log('Creating activity feed...');

  await Activity.create([
    {
      user: user._id,

      action: 'created',

      entityType: 'Transaction',

      entityId: recentTransactions[4]._id,

      description: 'expense · Breakfast',

      source: 'telegram',

      createdAt: dateFromNow(0, 8, 15),
    },

    {
      user: user._id,

      action: 'created',

      entityType: 'Transaction',

      entityId: recentTransactions[3]._id,

      description: 'income · Online order sales',

      source: 'telegram',

      createdAt: dateFromNow(0, 10, 5),
    },

    {
      user: user._id,

      action: 'completed',

      entityType: 'Task',

      entityId: tasks[9]._id,

      description: 'Completed 30 minute workout',

      source: 'web',

      createdAt: dateFromNow(0, 8, 30),
    },

    {
      user: user._id,

      action: 'created',

      entityType: 'Task',

      entityId: tasks[1]._id,

      description: 'Created Reply to pending clients',

      source: 'telegram',

      createdAt: dateFromNow(-1, 19),
    },

    {
      user: user._id,

      action: 'created',

      entityType: 'Goal',

      entityId: goals[1]._id,

      description: 'Created goal · Buy MacBook Air',

      source: 'web',

      createdAt: dateFromNow(-2, 15),
    },

    {
      user: user._id,

      action: 'updated',

      entityType: 'Project',

      entityId: storeProject._id,

      description: 'Updated Launch Online Store',

      source: 'web',

      createdAt: dateFromNow(-3, 16),
    },
  ]);

  // ==========================================================
  // FINAL
  // ==========================================================

  console.log('');
  console.log('========================================');
  console.log(' DEMO DATA READY');
  console.log('========================================');
  console.log('');

  console.log(`Account: ${user.fullName}`);
  console.log(`Email:   ${user.email}`);

  console.log('');
  console.log('Created:');
  console.log('  ✓ 3 financial accounts');
  console.log('  ✓ 6 months financial history');
  console.log('  ✓ Recent income and expenses');
  console.log('  ✓ Sales');
  console.log('  ✓ Transfers & savings');
  console.log('  ✓ 4 debts');
  console.log('  ✓ 12 tasks');
  console.log('  ✓ Daily Focus');
  console.log('  ✓ 3 projects');
  console.log('  ✓ 4 goals');
  console.log('  ✓ 4 bills');
  console.log('  ✓ 3 subscriptions');
  console.log('  ✓ 4 contacts');
  console.log('  ✓ 3 notes');
  console.log('  ✓ 3 habits');
  console.log('  ✓ 3 wishlist items');
  console.log('  ✓ 3 reminders');
  console.log('  ✓ Activity feed');

  console.log('');
  console.log('User, credentials and assigned plan were NOT modified.');
  console.log('');
}

try {
  await run();
} catch (error) {
  console.error('');
  console.error('Demo data seed failed:');
  console.error(error);

  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
