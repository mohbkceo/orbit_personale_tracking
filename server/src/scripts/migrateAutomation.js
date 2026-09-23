import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Task } from '../models/Task.js';
import { Reminder } from '../models/Reminder.js';
import { ReminderEvent } from '../models/ReminderEvent.js';
import { DailyFocus } from '../models/DailyFocus.js';
import { TaskExecutionEvent } from '../models/TaskExecutionEvent.js';
import { AutomationSettings } from '../models/AutomationSettings.js';

export async function migrateAutomation() {
  const states = { completed: 'completed', cancelled: 'cancelled' };
  const counts = {};
  for (const [status, executionState] of Object.entries(states)) {
    const result = await Task.updateMany({ status, executionState: { $exists: false } }, { $set: { executionState } });
    counts[status] = result.modifiedCount;
  }
  const remaining = await Task.updateMany({ executionState: { $exists: false } }, { $set: { executionState: 'idle' } });
  counts.idle = remaining.modifiedCount;
  for (const Model of [Task, Reminder, ReminderEvent, DailyFocus, TaskExecutionEvent, AutomationSettings]) await Model.createIndexes();
  return { backfilled: counts, indexes: 'ready' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await connectDatabase(); console.log(JSON.stringify(await migrateAutomation())); }
  finally { await disconnectDatabase(); }
}
