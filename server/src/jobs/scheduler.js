import cron from 'node-cron';
import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { checkAccess } from '../services/accessService.js';
import { processDueReminders } from './reminderWorker.js';
import { sendSummaries } from './summaryWorker.js';
import { updateOverdueStatuses } from './stateWorker.js';
import { runAutomationForUser } from './automationWorker.js';
import { getAutomationSettings } from '../services/automationSettings.service.js';

export async function runJobsOnce() {
  const automation = await getAutomationSettings();
  await processDueReminders();
  const users = await User.find({ status: 'ACTIVE' }).select('_id status');
  const connections = await TelegramConnection.find({ user: { $in: users.map((user) => user._id) } });
  const connected = new Set(connections.map((row) => String(row.user)));
  for (const user of users) {
    await updateOverdueStatuses(user._id);
    if ((await checkAccess(user)).eligible) {
      await runAutomationForUser(user._id, new Date(), automation);
      if (connected.has(String(user._id))) await sendSummaries(user._id);
    }
  }
}

export function startJobs() {
  cron.schedule('* * * * *', () => runJobsOnce().catch((error) => console.error('Scheduled job failed:', error)));
}
