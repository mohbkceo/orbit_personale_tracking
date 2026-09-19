import { Activity } from '../models/Activity.js';

export async function recordActivity(userId, { action, entityType, entityId, description, previousData, newData, source = 'web' }) {
  return Activity.create({ user: userId, action, entityType, entityId, description, previousData, newData, source });
}
