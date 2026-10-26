import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { TaskDigestDelivery } from '../models/TaskDigestDelivery.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { User } from '../models/User.js';
import { checkAccess } from '../services/accessService.js';
import { canAccess } from '../services/entitlementService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { automationTimezone } from '../services/automationSettings.service.js';
import { collectTaskDigest, renderTaskDigest } from '../services/taskReminderDigest.service.js';
import { env } from '../config/env.js';
import { sendMessage } from '../telegram/botClient.js';
import { getAutomaticTemplate, renderAutomaticMessage } from '../services/automaticMessages.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function runTaskReminderDigestForUser(userId, now, rules) {
  const policy = rules.taskReminderDigest;
  if (!rules.general.enabled || !rules.general.workerEnabled || !policy?.enabled || !env.ORBIT_TELEGRAM_BOT_TOKEN) return false;
  const [settings, connection, user] = await Promise.all([getSettingsDocument(userId), TelegramConnection.findOne({ user: userId }), User.findById(userId)]);
  if (!user || !(await checkAccess(user)).eligible || !connection || !settings.reminders?.enabled || !settings.reminders?.automaticEnabled || settings.reminders?.deliveryChannels?.telegram === false) return false;
  if (!(await canAccess(user, 'tasks')).allowed || !(await canAccess(user, 'reminders')).allowed || !(await canAccess(user, 'telegram-assistant')).allowed) return false;
  const zone = automationTimezone(settings, rules);
  const local = dayjs(now).tz(zone);
  const time = local.format('HH:mm');
  if (!policy.times.includes(time)) return false;
  const digest = renderTaskDigest(await collectTaskDigest(userId, rules, zone, now), settings);
  if (!digest) return false;
  const template = await getAutomaticTemplate('task-digest');
  if (!template.enabled) return false;
  const key = { user: userId, localDate: local.format('YYYY-MM-DD'), time };
  let claim;
  try { claim = await TaskDigestDelivery.create({ ...key, claimedAt: now }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    return false;
  }
  // Keep the slot claim if Telegram accepts the message before an API error.
  const edited = ['en', 'ar'].some((language) => template.variants?.[language]?.title !== '{legacyTitle}' || template.variants?.[language]?.body !== '{legacyMessage}');
  const custom = edited ? await renderAutomaticMessage('task-digest', settings.language, { legacyTitle: 'Task Digest', legacyMessage: digest.text.replace(/<[^>]*>/g, ''), taskList: digest.text.replace(/<[^>]*>/g, ''), taskCount: String(digest.markup.inline_keyboard.flat().length) }) : null;
  const markup = { inline_keyboard: [...digest.markup.inline_keyboard, ...(template.buttons || []).map((row) => row.map((button) => ({ text: button.label, url: button.url })))] };
  await sendMessage(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, custom ? `<b>${custom.title}</b>\n\n${custom.message}` : digest.text, markup);
  await TaskDigestDelivery.updateOne({ _id: claim._id }, { $set: { sentAt: new Date() } });
  return true;
}
