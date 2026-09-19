import { TelegramConnection } from '../models/TelegramConnection.js';
import { TelegramLinkToken } from '../models/TelegramLinkToken.js';
import { User } from '../models/User.js';
import { checkAccess } from './accessService.js';
import { makeToken, hashToken } from './activationService.js';
import { audit } from './auditService.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export async function createTelegramLink(userId) {
  if (!env.ORBIT_TELEGRAM_BOT_TOKEN || !env.ORBIT_TELEGRAM_BOT_USERNAME) throw new AppError('Telegram is not configured.', 503);
  if (await TelegramConnection.exists({ user: userId })) throw new AppError('Telegram is already connected.', 409);
  await TelegramLinkToken.deleteMany({ user: userId, consumedAt: null });
  const token = makeToken();
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await TelegramLinkToken.create({ user: userId, tokenHash: hashToken(token), expiresAt });
  return { url: `https://t.me/${env.ORBIT_TELEGRAM_BOT_USERNAME.replace(/^@/, '')}?start=${token}`, expiresAt };
}

export async function consumeTelegramLink(token, telegramUser) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(String(token))) throw new AppError('Invalid Telegram link.', 400, undefined, 'TELEGRAM_LINK_INVALID');
  const row = await TelegramLinkToken.findOneAndUpdate({ tokenHash: hashToken(token), consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!row) throw new AppError('This Telegram link has expired or was already used.', 410, undefined, 'TELEGRAM_LINK_EXPIRED');
  const user = await User.findById(row.user);
  if (!user || user.status !== 'ACTIVE' || (user.onboardingCompletedAt && !(await checkAccess(user)).eligible)) throw new AppError('Orbit access is required to link Telegram.', 403, undefined, 'ACCESS_REQUIRED');
  if (await TelegramConnection.exists({ telegramUserId: String(telegramUser.id) })) throw new AppError('This Telegram account is already connected to another Orbit account.', 409, undefined, 'TELEGRAM_ALREADY_LINKED');
  if (await TelegramConnection.exists({ user: row.user })) throw new AppError('This Orbit account already has a Telegram connection.', 409, undefined, 'TELEGRAM_ALREADY_LINKED');
  let connection;
  try { connection = await TelegramConnection.create({ user: row.user, telegramUserId: String(telegramUser.id), chatId: String(telegramUser.chatId), telegramUsername: telegramUser.username || '', linkedAt: new Date() }); }
  catch (error) { if (error.code === 11000) throw new AppError('This Telegram account is already connected to another Orbit account.', 409, undefined, 'TELEGRAM_ALREADY_LINKED'); throw error; }
  await audit('TELEGRAM_LINKED', { actorType: 'USER', actorId: row.user, targetType: 'TelegramConnection', targetId: connection._id });
  return connection;
}

export async function unlinkTelegram(userId) {
  const row = await TelegramConnection.findOneAndDelete({ user: userId });
  if (row) await audit('TELEGRAM_UNLINKED', { actorType: 'USER', actorId: userId, targetType: 'TelegramConnection', targetId: row._id });
  return Boolean(row);
}
