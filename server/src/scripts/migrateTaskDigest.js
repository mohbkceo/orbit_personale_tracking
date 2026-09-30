import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { TaskDigestDelivery } from '../models/TaskDigestDelivery.js';
import { backfillTaskReminderState, suppressLegacyTaskReminders } from '../services/migrateTaskReminders.service.js';

export async function migrateTaskDigest() {
  const tasks = await backfillTaskReminderState();
  const remindersCancelled = await suppressLegacyTaskReminders();
  await TaskDigestDelivery.createIndexes();
  return { tasks, remindersCancelled };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await connectDatabase(); console.log(JSON.stringify(await migrateTaskDigest())); }
  finally { await disconnectDatabase(); }
}
