import { connectDatabase, disconnectDatabase } from '../config/db.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Admin } from '../models/Admin.js';
import { hashPassword, normalizeEmail } from '../services/authService.js';

export async function bootstrapSuperAdmin() {
  const existing = await Admin.findOne({ role: 'SUPER_ADMIN' });
  if (existing) return existing;
  const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME } = process.env;
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD || !SUPER_ADMIN_NAME || SUPER_ADMIN_PASSWORD.length < 12) throw new Error('Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME, and a SUPER_ADMIN_PASSWORD of at least 12 characters.');
  const email = normalizeEmail(SUPER_ADMIN_EMAIL);
  if (await Admin.exists({ email })) throw new Error('An admin with the bootstrap email exists but is not a Super Admin; resolve manually.');
  return Admin.create({ email, fullName: SUPER_ADMIN_NAME, passwordHash: await hashPassword(SUPER_ADMIN_PASSWORD), role: 'SUPER_ADMIN' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await connectDatabase();
    const admin = await bootstrapSuperAdmin();
    console.log(`Super Admin ready: ${admin.email}`);
  } finally { await disconnectDatabase(); }
}
