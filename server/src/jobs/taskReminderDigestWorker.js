import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { TaskDigestDelivery } from '../models/TaskDigestDelivery.js';
import { TelegramConnection } from '../models/TelegramConnection.js';
import { User } from '../models/User.js';
import { checkAccess } from '../services/accessService.js';
import { getSettingsDocument } from '../services/settingsService.js';
import { automationTimezone } from '../services/automationSettings.service.js';
import { collectTaskDigest, renderTaskDigest } from '../services/taskReminderDigest.service.js';
import { env } from '../config/env.js';
import { sendMessage } from '../telegram/botClient.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function runTaskReminderDigestForUser(userId, now, rules) {
  const policy = rules.taskReminderDigest;
  if (!rules.general.enabled || !rules.general.workerEnabled || !policy?.enabled || !env.ORBIT_TELEGRAM_BOT_TOKEN) return false;
  const [settings, connection, user] = await Promise.all([getSettingsDocument(userId), TelegramConnection.findOne({ user: userId }), User.findById(userId)]);
  if (!user || !(await checkAccess(user)).eligible || !connection || !settings.reminders?.enabled || !settings.reminders?.automaticEnabled || settings.reminders?.deliveryChannels?.telegram === false) return false;
  const zone = automationTimezone(settings, rules);
  const local = dayjs(now).tz(zone);
  const time = local.format('HH:mm');
  if (!policy.times.includes(time)) return false;
  const digest = renderTaskDigest(await collectTaskDigest(userId, rules, zone, now));
  if (!digest) return false;
  const key = { user: userId, localDate: local.format('YYYY-MM-DD'), time };
  let claim;
  try { claim = await TaskDigestDelivery.create({ ...key, claimedAt: now }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    return false;
  }
  try {
    await sendMessage(env.ORBIT_TELEGRAM_BOT_TOKEN, connection.chatId, digest.text, digest.markup);
    await TaskDigestDelivery.updateOne({ _id: claim._id }, { $set: { sentAt: new Date() } });
    return true;
  } catch (error) {
    // Keep the slot claim: Telegram may have accepted the message before an API error.
    throw error;
  }
}
