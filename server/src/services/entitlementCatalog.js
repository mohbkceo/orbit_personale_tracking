// Explicit rollout defaults apply until the catalog is seeded. Legacy aliases
// preserve benefits in subscriptions purchased before section keys existed.
export const SECTION_DEFINITIONS = [
  ['dashboard', 'Dashboard', 'Workspace', 'mdi:view-dashboard-outline', true],
  ['tasks', 'Tasks', 'Productivity', 'mdi:check-circle-outline', true],
  ['reminders', 'Reminders', 'Productivity', 'mdi:bell-outline', true],
  ['events', 'Events', 'Productivity', 'mdi:calendar-outline', true],
  ['accounts', 'Accounts', 'Finance', 'mdi:wallet-outline', true],
  ['transactions', 'Transactions', 'Finance', 'mdi:swap-horizontal', true],
  ['expenses', 'Expenses', 'Finance', 'mdi:receipt-text-outline', true],
  ['income', 'Income', 'Finance', 'mdi:cash-plus', true],
  ['debts', 'Debts', 'Finance', 'mdi:bank-outline', true],
  ['bills', 'Bills', 'Planning', 'mdi:credit-card-outline', true],
  ['subscriptions', 'Subscriptions', 'Planning', 'mdi:repeat', true],
  ['goals', 'Goals', 'Planning', 'mdi:target', true],
  ['projects', 'Projects', 'Personal', 'mdi:folder-outline', false],
  ['habits', 'Habits', 'Personal', 'mdi:repeat', false],
  ['wishlist', 'Wishlist', 'Personal', 'mdi:heart-outline', false],
  ['contacts', 'Contacts', 'Personal', 'mdi:account-multiple-outline', false],
  ['notes', 'Notes', 'Personal', 'mdi:note-text-outline', true],
];

export const CAPABILITY_DEFINITIONS = [
  ['telegram-assistant', 'Telegram assistant', 'Integrations', 'simple-icons:telegram', true, 'BOOLEAN'],
  ['quick-access', 'Quick Add and search', 'Productivity', 'mdi:magnify', true, 'BOOLEAN'],
  ['export-data', 'Data export', 'Account', 'mdi:download', true, 'BOOLEAN'],
  ['daily-focus', 'Daily focus', 'Productivity', 'mdi:target', true, 'BOOLEAN'],
  ['advanced-analytics', 'Advanced analytics', 'Insights', 'mdi:chart-line', false, 'BOOLEAN'],
  ['active-tasks-limit', 'Maximum active tasks', 'Limits', 'mdi:check-circle-outline', true, 'LIMIT'],
  ['projects-limit', 'Maximum projects', 'Limits', 'mdi:folder-outline', true, 'LIMIT'],
  ['accounts-limit', 'Maximum accounts', 'Limits', 'mdi:wallet-outline', true, 'LIMIT'],
  ['reminders-limit', 'Maximum reminders', 'Limits', 'mdi:bell-outline', true, 'LIMIT'],
];

export const DEFAULTS = Object.fromEntries([
  ...SECTION_DEFINITIONS.map(([key, name, category, icon, free], order) => [key, { key, name, category, icon, scope: 'SECTION', type: 'BOOLEAN', accessMode: free ? 'FREE' : 'PLAN_BASED', order: order * 10 }]),
  ...CAPABILITY_DEFINITIONS.map(([key, name, category, icon, free, type], order) => [key, { key, name, category, icon, scope: 'CAPABILITY', type, accessMode: free ? 'FREE' : 'PLAN_BASED', order: 200 + order * 10 }]),
]);

export const LEGACY_FEATURE_KEYS = {
  accounts: ['accounts_transactions'], transactions: ['accounts_transactions'],
  expenses: ['income_expenses'], income: ['income_expenses'], debts: ['debts'],
  bills: ['bills_subscriptions'], subscriptions: ['bills_subscriptions'],
  goals: ['goals_savings'], projects: ['projects'], habits: ['habits'], wishlist: ['wishlist'],
  contacts: ['contacts'], notes: ['notes'], reminders: ['reminders'], tasks: ['tasks'],
  'telegram-assistant': ['telegram_assistant'], 'quick-access': ['quick_access'],
};
