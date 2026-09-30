import { Goal } from '../models/Planning.js';
import { getSettingsDocument } from './settingsService.js';
import { regenerateAutomaticReminderPlan } from './reminders/reminderService.js';

export async function createGoal(userId, input) {
  const settings = await getSettingsDocument(userId);
  const goal = await Goal.create({ ...input, user: userId, reminderMode: input.reminderMode || settings.reminders?.defaultEntityModes?.goal || 'automatic' });
  await regenerateAutomaticReminderPlan(userId, 'goal', goal._id);
  return goal;
}
