import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { User } from '../models/User.js';
import { AuthSession } from '../models/AuthSession.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { audit } from './auditService.js';
import { hashPassword, normalizeEmail } from './authService.js';

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function initiateAccountAction(userId, adminId, kind, newEmail, reason, ip) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    throw new AppError('Email delivery is not configured', 503, undefined, 'EMAIL_NOT_CONFIGURED');
  const user = await User.findById(userId).select('email fullName');
  if (!user) throw new AppError('User not found', 404);
  const recipient = kind === 'EMAIL_CHANGE' ? normalizeEmail(newEmail) : user.email;
  if (kind === 'EMAIL_CHANGE' && (await User.exists({ email: recipient })))
    throw new AppError('Email already in use', 409);
  const token = crypto.randomBytes(32).toString('base64url');
  const session = await mongoose.startSession();
  let row;
  try {
    await session.withTransaction(async () => {
      [row] = await AccountActionToken.create(
        [
          {
            user: user._id,
            tokenHash: digest(token),
            kind,
            newEmail: kind === 'EMAIL_CHANGE' ? recipient : undefined,
            expiresAt: new Date(Date.now() + 30 * 60_000),
            requestedBy: adminId,
          },
        ],
        { session },
      );
      await audit(
        kind === 'EMAIL_CHANGE' ? 'ADMIN_EMAIL_CHANGE_REQUESTED' : 'ADMIN_PASSWORD_RESET_REQUESTED',
        {
          actorType: 'ADMIN',
          actorId: adminId,
          targetType: 'User',
          targetId: user._id,
          metadata: { reason, expiresAt: row.expiresAt },
          ip,
          session,
        },
      );
    });
  } finally {
    await session.endSession();
  }
  const url = `${env.CLIENT_URL.split(',')[0].trim().replace(/\/$/, '')}/account-action/${token}`;
  const subject =
    kind === 'EMAIL_CHANGE' ? 'Verify your new Orbit email' : 'Reset your Orbit password';
  let delivered = false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [recipient],
        subject,
        text: `An Orbit administrator requested this account action. Open this one-time link within 30 minutes: ${url}\n\nIf you did not expect this, contact support.`,
      }),
    });
    delivered = response.ok;
  } catch {
    delivered = false;
  }
  if (!delivered) {
    await AccountActionToken.updateOne({ _id: row._id }, { $set: { consumedAt: new Date() } });
    await audit('ADMIN_ACCOUNT_EMAIL_DELIVERY_FAILED', {
      actorType: 'ADMIN',
      actorId: adminId,
      targetType: 'User',
      targetId: user._id,
      metadata: { actionTokenId: String(row._id), kind },
      ip,
    });
    throw new AppError('Email delivery failed', 502, undefined, 'EMAIL_DELIVERY_FAILED');
  }
  return {
    sent: true,
    destination: recipient.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
    expiresAt: row.expiresAt,
  };
}

export async function inspectAccountAction(token) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new AppError('Link invalid or expired', 410);
  const row = await AccountActionToken.findOne({
    tokenHash: digest(token),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).select('kind newEmail expiresAt');
  if (!row) throw new AppError('Link invalid or expired', 410);
  return {
    kind: row.kind,
    newEmail: row.kind === 'EMAIL_CHANGE' ? row.newEmail : undefined,
    expiresAt: row.expiresAt,
  };
}

export async function completeAccountAction(token, password) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) throw new AppError('Link invalid or expired', 410);
  const session = await mongoose.startSession();
  let kind;
  try {
    await session.withTransaction(async () => {
      const row = await AccountActionToken.findOneAndUpdate(
        { tokenHash: digest(token), consumedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { consumedAt: new Date() } },
        { new: true, session },
      );
      if (!row) throw new AppError('Link invalid or expired', 410);
      kind = row.kind;
      if (kind === 'PASSWORD_RESET') {
        if (!password || password.length < 12 || password.length > 200)
          throw new AppError('Use a password of at least 12 characters', 422);
        await User.updateOne(
          { _id: row.user },
          { $set: { passwordHash: await hashPassword(password) }, $inc: { authVersion: 1 } },
          { session },
        );
      } else {
        if (await User.exists({ email: row.newEmail }).session(session))
          throw new AppError('Email already in use', 409);
        await User.updateOne(
          { _id: row.user },
          { $set: { email: row.newEmail }, $inc: { authVersion: 1 } },
          { session },
        );
      }
      await AuthSession.updateMany(
        { user: row.user, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      await audit(kind === 'PASSWORD_RESET' ? 'USER_PASSWORD_RECOVERED' : 'USER_EMAIL_VERIFIED', {
        actorType: 'USER',
        actorId: row.user,
        targetType: 'User',
        targetId: row.user,
        metadata: { actionTokenId: String(row._id) },
        session,
      });
    });
  } finally {
    await session.endSession();
  }
  return { completed: true, kind };
}
