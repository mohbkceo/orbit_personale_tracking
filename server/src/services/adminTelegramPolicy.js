import { User } from '../models/User.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { MessagePreference } from '../models/MessagePreference.js';

// Admin communications do not inherit personal assistant/plan entitlements.
// Custom/unspecified campaigns stay consent-gated; service notices do not.
export const isPromotional = (category) => !['ANNOUNCEMENT', 'PRODUCT_UPDATE', 'IMPORTANT_NOTICE'].includes(category);
export const validConnection = (connection) => Boolean(connection && /^-?[1-9]\d*$/.test(connection.chatId || '') && !connection.deliveryDisabledAt);

export async function adminTelegramRecipient(userId, { promotional = false, chatId } = {}) {
  const [user, connection, preference] = await Promise.all([
    User.findById(userId).lean(), TelegramConnection.findOne({ user: userId }).lean(),
    promotional ? MessagePreference.findOne({ user: userId }).lean() : null,
  ]);
  if (user?.status !== 'ACTIVE' || !validConnection(connection) || chatId && chatId !== connection.chatId || promotional && !preference?.promotionalTelegram) return null;
  return { user, connection };
}

export async function recordTelegramFailure(userId, chatId, error) {
  const code = Number(error.telegramCode);
  if (code === 403 || code === 400 && /chat not found|user.*deactivated|bot was blocked/i.test(error.message)) {
    await TelegramConnection.updateOne({ user: userId, chatId }, { $set: { deliveryDisabledAt: new Date() } });
  }
}
