import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorType: { type: String, enum: ['ADMIN', 'USER', 'SYSTEM'], required: true },
  actorId: mongoose.Schema.Types.ObjectId,
  event: { type: String, required: true, index: true },
  targetType: String,
  targetId: mongoose.Schema.Types.ObjectId,
  metadata: mongoose.Schema.Types.Mixed,
  ip: String,
}, { timestamps: true });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
