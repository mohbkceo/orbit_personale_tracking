import { TelegramSession } from '../models/TelegramSession.js';

const key = (userId, chatId) => ({ telegramUserId: String(userId), chatId: String(chatId) });
export async function setPending(userId, chatId, action, payload = {}) {
  return TelegramSession.findOneAndUpdate(key(userId, chatId), {
    $set: { action, payload, expiresAt: new Date(Date.now() + 15 * 60_000) },
  }, { upsert: true, new: true });
}
export async function getPending(userId, chatId) {
  const session = await TelegramSession.findOne(key(userId, chatId));
  return session?.expiresAt > new Date() ? session : null;
}
export async function clearPending(userId, chatId) {
  return TelegramSession.deleteOne(key(userId, chatId));
}
export async function pendingExpired(userId, chatId) {
  const session = await TelegramSession.findOne(key(userId, chatId));
  if (!session || session.expiresAt > new Date()) return false;
  await clearPending(userId, chatId);
  return true;
}
