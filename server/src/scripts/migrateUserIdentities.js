import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { env } from '../config/env.js';
import {
  inspectUserIdentities,
  migrateUserIdentities,
} from '../services/identityMigrationService.js';

export async function main(args = process.argv.slice(2)) {
  const allowed =
    /^(--apply|--writes-paused|--expected-plan=[a-f0-9]{64}|--replace-email-index=[\w.-]+)$/;
  if (args.some((arg) => !allowed.test(arg))) throw new Error('Unknown argument');
  const connection = await mongoose
    .createConnection(env.MONGODB_URI, {
      autoIndex: false,
      autoCreate: false,
      serverSelectionTimeoutMS: 10000,
    })
    .asPromise();
  try {
    const users = connection.collection('users');
    const report = args.includes('--apply')
      ? await migrateUserIdentities(users, {
          expectedFingerprint: args
            .find((arg) => arg.startsWith('--expected-plan='))
            ?.split('=')[1],
          replaceEmailIndexes: args
            .filter((arg) => arg.startsWith('--replace-email-index='))
            .map((arg) => arg.split('=')[1]),
          writesPaused: args.includes('--writes-paused'),
        })
      : await inspectUserIdentities(users);
    const { phoneUpdates: _privateUpdates, ...safeReport } = report;
    console.log(JSON.stringify(safeReport, null, 2));
    if (report.problems.length) process.exitCode = 1;
  } finally {
    await connection.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Identity migration stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
