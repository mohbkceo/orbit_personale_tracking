import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Admin } from '../models/Admin.js';
import { Feature } from '../models/Feature.js';
import { Plan } from '../models/Plan.js';

const FEATURES = [
  {
    key: 'tasks',
    name: 'Tasks',
    description: 'Create and organize personal tasks.',
    category: 'Productivity',
    icon: 'mdi:check-circle-outline',
    type: 'UNLIMITED',
    order: 10,
  },
  {
    key: 'reminders',
    name: 'Reminders',
    description: 'Schedule reminders for important tasks.',
    category: 'Productivity',
    icon: 'mdi:bell-outline',
    type: 'UNLIMITED',
    order: 20,
  },
  {
    key: 'accounts_transactions',
    name: 'Accounts & Transactions',
    description: 'Manage financial accounts and transactions.',
    category: 'Finance',
    icon: 'mdi:wallet-outline',
    type: 'BOOLEAN',
    order: 30,
  },
  {
    key: 'income_expenses',
    name: 'Income & Expenses',
    description: 'Track income and daily expenses.',
    category: 'Finance',
    icon: 'mdi:cash-multiple',
    type: 'BOOLEAN',
    order: 40,
  },
  {
    key: 'debts',
    name: 'Debt Tracking',
    description: 'Track incoming and outgoing debts.',
    category: 'Finance',
    icon: 'mdi:bank-outline',
    type: 'BOOLEAN',
    order: 50,
  },
  {
    key: 'bills_subscriptions',
    name: 'Bills & Subscriptions',
    description: 'Keep track of bills and recurring subscriptions.',
    category: 'Planning',
    icon: 'mdi:credit-card-outline',
    type: 'BOOLEAN',
    order: 60,
  },
  {
    key: 'goals_savings',
    name: 'Goals & Savings',
    description: 'Plan goals and track savings.',
    category: 'Planning',
    icon: 'mdi:target',
    type: 'BOOLEAN',
    order: 70,
  },
  {
    key: 'notes',
    name: 'Notes',
    description: 'Keep personal notes inside Orbit.',
    category: 'Personal',
    icon: 'mdi:note-text-outline',
    type: 'UNLIMITED',
    order: 80,
  },

  // PLUS
  {
    key: 'telegram_assistant',
    name: 'Telegram Assistant',
    description: 'Manage Orbit directly from Telegram.',
    category: 'Integrations',
    icon: 'simple-icons:telegram',
    type: 'BOOLEAN',
    order: 90,
  },
  {
    key: 'projects',
    name: 'Projects',
    description: 'Organize and manage personal projects.',
    category: 'Planning',
    icon: 'mdi:folder-outline',
    type: 'UNLIMITED',
    order: 100,
  },
  {
    key: 'habits',
    name: 'Habits',
    description: 'Build and track personal habits.',
    category: 'Planning',
    icon: 'mdi:repeat',
    type: 'UNLIMITED',
    order: 110,
  },
  {
    key: 'wishlist',
    name: 'Wishlist',
    description: 'Save and organize things you want.',
    category: 'Personal',
    icon: 'mdi:heart-outline',
    type: 'UNLIMITED',
    order: 120,
  },
  {
    key: 'contacts',
    name: 'Contacts',
    description: 'Keep important personal contacts organized.',
    category: 'Personal',
    icon: 'mdi:account-multiple-outline',
    type: 'UNLIMITED',
    order: 130,
  },
  {
    key: 'quick_access',
    name: 'Quick Add & Search',
    description: 'Quickly add and find information across Orbit.',
    category: 'Productivity',
    icon: 'mdi:magnify',
    type: 'BOOLEAN',
    order: 140,
  },
];

const STARTER_FEATURES = [
  'tasks',
  'reminders',
  'accounts_transactions',
  'income_expenses',
  'debts',
  'bills_subscriptions',
  'goals_savings',
  'notes',
];

const PLUS_FEATURES = FEATURES.map((feature) => feature.key);

function buildEntitlements(featuresByKey, keys) {
  return keys.map((key) => ({
    feature: featuresByKey[key]._id,
    enabled: true,
    limit: null,
    value: '',
  }));
}

async function run() {
  await connectDatabase();

  const admin =
    (await Admin.findOne({
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    })) ||
    (await Admin.findOne({
      status: 'ACTIVE',
    }));

  if (!admin) {
    throw new Error('No active admin found. Create/bootstrap an admin before running this seed.');
  }

  console.log(`Using admin: ${admin.email}`);

  // -----------------------------
  // FEATURES
  // -----------------------------

  for (const feature of FEATURES) {
    await Feature.findOneAndUpdate(
      { key: feature.key },
      {
        $set: {
          ...feature,
          publicVisible: true,
          status: 'ACTIVE',
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  const savedFeatures = await Feature.find({
    key: { $in: FEATURES.map((feature) => feature.key) },
  });

  const featuresByKey = Object.fromEntries(savedFeatures.map((feature) => [feature.key, feature]));

  // -----------------------------
  // STARTER
  // -----------------------------

  await Plan.findOneAndUpdate(
    { slug: 'starter' },
    {
      $set: {
        name: 'Starter',
        slug: 'starter',

        description: 'Essential tools to organize your tasks, money and daily life.',

        durationValue: 30,
        durationUnit: 'DAY',

        price: {
          amount: 500,
          originalAmount: null,
          currency: 'DZD',
          suffix: '/ 30 days',
        },

        appearance: {
          icon: 'mdi:rocket-launch-outline',
          color: '#173D30',
          textColor: '#FFFFFF',
          badge: '',
          highlighted: false,
        },

        public: {
          visible: true,
          order: 1,
          ctaText: 'Get Starter',
          shortDescription: 'Essential tools for everyday organization.',
        },

        features: buildEntitlements(featuresByKey, STARTER_FEATURES),

        status: 'ACTIVE',
      },

      $setOnInsert: {
        createdBy: admin._id,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  // -----------------------------
  // PLUS
  // -----------------------------

  await Plan.findOneAndUpdate(
    { slug: 'plus' },
    {
      $set: {
        name: 'Plus',
        slug: 'plus',

        description:
          'The complete Orbit personal operating system with every productivity, finance and personal tool.',

        durationValue: 365,
        durationUnit: 'DAY',

        price: {
          amount: 2500,
          originalAmount: null,
          currency: 'DZD',
          suffix: '/ year',
        },

        appearance: {
          icon: 'mdi:creation-outline',
          color: '#84CC16',
          textColor: '#173D30',
          badge: 'Best Value',
          highlighted: true,
        },

        public: {
          visible: true,
          order: 2,
          ctaText: 'Get Plus',
          shortDescription: 'The complete Orbit experience.',
        },

        features: buildEntitlements(featuresByKey, PLUS_FEATURES),

        status: 'ACTIVE',
      },

      $setOnInsert: {
        createdBy: admin._id,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  console.log('');
  console.log('✓ Features seeded:', FEATURES.length);
  console.log('✓ Starter: 500 DZD / 30 days');
  console.log('✓ Plus: 2500 DZD / 365 days');
  console.log('✓ Seed completed.');
}

try {
  await run();
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
