import { Setting } from '../models/Setting.js';
import { decryptSecret, encryptSecret, maskToken } from '../utils/crypto.js';

export async function getSettingsDocument() {
  return Setting.findOneAndUpdate({ singletonKey: 'primary' }, { $setOnInsert: { singletonKey: 'primary' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

export function publicSettings(settings) {
  const value = settings.toObject ? settings.toObject() : settings;
  const { encryptedBotToken, iv, authTag, ...telegram } = value.telegram || {};
  let maskedBotToken = null;
  try { maskedBotToken = maskToken(decryptSecret({ encrypted: encryptedBotToken, iv, authTag })); } catch { maskedBotToken = 'Configured (key changed)'; }
  return { ...value, telegram: { ...telegram, botConfigured: Boolean(encryptedBotToken), maskedBotToken } };
}

export async function updateSettings(input) {
  const settings = await getSettingsDocument();
  const telegramInput = input.telegram || {};
  const { botToken, ...safeTelegramInput } = telegramInput;
  Object.assign(settings, Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'telegram')));
  Object.assign(settings.telegram, safeTelegramInput);
  if (botToken) {
    const encrypted = encryptSecret(botToken.trim());
    settings.telegram.encryptedBotToken = encrypted.encrypted;
    settings.telegram.iv = encrypted.iv;
    settings.telegram.authTag = encrypted.authTag;
  }
  await settings.save();
  return settings;
}

export function telegramToken(settings) {
  return decryptSecret({ encrypted: settings.telegram.encryptedBotToken, iv: settings.telegram.iv, authTag: settings.telegram.authTag });
}
