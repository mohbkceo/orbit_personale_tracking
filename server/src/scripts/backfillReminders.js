import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User } from '../models/User.js';
import { Reminder } from '../models/Reminder.js';
import { ReminderEvent } from '../models/ReminderEvent.js';
import { Task } from '../models/Task.js';
import { backfillUpcomingReminders } from '../services/reminders/reminderBackfillService.js';

export async function backfillReminders() {
  await Promise.all([
    Reminder.createIndexes(),
    ReminderEvent.createIndexes(),
    Task.createIndexes(),
  ]);
  const result = {};
  for await (const user of User.find({ status: 'ACTIVE' }).select('_id').cursor())
    result[String(user._id)] = await backfillUpcomingReminders(user._id);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await connectDatabase();
    console.log(JSON.stringify(await backfillReminders(), null, 2));
  } finally {
    await disconnectDatabase();
  }
}
