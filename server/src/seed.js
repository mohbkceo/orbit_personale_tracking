import { connectDatabase, disconnectDatabase } from './config/db.js';
import { migrateLegacy } from './scripts/migrateLegacy.js';
import { User } from './models/User.js';
import { Account } from './models/Account.js';
import { Transaction } from './models/Transaction.js';
import { Task } from './models/Task.js';

if (process.env.NODE_ENV === 'production') throw new Error('Seed is disabled in production');
try {
  await connectDatabase();
  const { owner } = await migrateLegacy();
  const user = await User.findOne({ email: owner });
  if (await Account.exists({ user: user._id })) {
    console.log('Seed skipped: the owner already has data. No records were removed.');
  } else {
    const account = await Account.create({ user: user._id, name: 'Cash', type: 'cash', openingBalance: 1000 });
    await Transaction.create({ user: user._id, type: 'expense', amount: 100, accountId: account._id, description: 'Sample expense', category: 'Food' });
    await Task.create({ user: user._id, title: 'Explore Orbit', priority: 'medium' });
    console.log('Non-destructive development examples created.');
  }
} finally { await disconnectDatabase(); }
