import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { migrateWishlist } from '../services/wishlistMigrationService.js';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const userId = args.find((arg) => arg.startsWith('--user='))?.slice(7);
  if (userId && !mongoose.isValidObjectId(userId)) throw new Error('Invalid --user ID');
  if (
    args.some(
      (arg) => !['--apply', '--dry-run', '--validate'].includes(arg) && !arg.startsWith('--user='),
    )
  )
    throw new Error('Unknown argument');
  try {
    // Even development dry runs must not create indexes as a side effect.
    await mongoose.connect(env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
    const report = await migrateWishlist({
      userId,
      dryRun:
        !args.includes('--apply') || args.includes('--dry-run') || args.includes('--validate'),
      validate: args.includes('--validate'),
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
