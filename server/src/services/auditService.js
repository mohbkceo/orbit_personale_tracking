import { AuditLog } from '../models/AuditLog.js';

export async function audit(event, { actorType = 'SYSTEM', actorId, targetType, targetId, metadata, ip, session } = {}) {
  const [entry] = await AuditLog.create([{ event, actorType, actorId, targetType, targetId, metadata, ip }], { session });
  return entry;
}
