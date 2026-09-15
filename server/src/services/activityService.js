import { Activity } from '../models/Activity.js';

export async function recordActivity({ action, entityType, entityId, description, previousData, newData, source = 'web' }) {
  return Activity.create({ action, entityType, entityId, description, previousData, newData, source });
}
