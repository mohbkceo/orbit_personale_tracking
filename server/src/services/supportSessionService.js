import mongoose from 'mongoose';
import { SupportSession } from '../models/SupportSession.js';
import { audit } from './auditService.js';

export async function expireSupportSession(row, ip) {
  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const changed = await SupportSession.updateOne(
        { _id: row._id, revokedAt: null, expiresAt: { $lte: new Date() } },
        { $set: { revokedAt: new Date(), revokedReason: 'EXPIRED' } },
        { session: dbSession },
      );
      if (changed.modifiedCount)
        await audit('SUPPORT_SESSION_EXPIRED', {
          actorType: 'ADMIN',
          actorId: row.admin,
          targetType: 'User',
          targetId: row.user,
          metadata: { supportSessionId: String(row._id), scope: 'READ_ONLY' },
          ip,
          session: dbSession,
        });
    });
  } finally {
    await dbSession.endSession();
  }
}

export async function expireDueSupportSessions() {
  const due = await SupportSession.find({ revokedAt: null, expiresAt: { $lte: new Date() } })
    .select('_id admin user')
    .limit(100);
  for (const row of due) await expireSupportSession(row);
}
