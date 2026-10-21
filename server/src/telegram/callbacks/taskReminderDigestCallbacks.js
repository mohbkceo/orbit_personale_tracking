import mongoose from 'mongoose';
import { Task } from '../../models/Task.js';
import { getAutomationSettings, automationTimezone } from '../../services/automationSettings.service.js';
import { getSettingsDocument } from '../../services/settingsService.js';
import { collectTaskDigest, digestNumber, renderTaskDigest } from '../../services/taskReminderDigest.service.js';
import { executeTask } from '../../services/taskExecution.service.js';
import { archiveTask, updateTask } from '../../services/taskService.js';
import { escapeHtml, taskDue } from '../formatters.js';
import { telegramRequest } from '../botClient.js';
import { telegramText as tr } from '../../i18n/telegram.js';

const eligible = { archived: false, status: { $in: ['todo', 'in_progress'] }, reminderMode: { $nin: ['custom', 'off'] }, taskReminderState: { $ne: 'muted' } };

async function edit(callback, token, view) {
  try {
    await telegramRequest(token, 'editMessageText', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, text: view.text, parse_mode: 'HTML', reply_markup: view.markup || { inline_keyboard: [] } });
  } catch (error) {
    if (!/message is not modified/i.test(error.message)) throw error;
  }
}

export async function handleTaskReminderDigestCallback(callback, userId, token) {
  const [, action, id] = String(callback.data || '').split(':');
  const answer = (text) => telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text });
  const rules = await getAutomationSettings();
  const settings = await getSettingsDocument(userId);
  const zone = automationTimezone(settings, rules);
  if (action === 'back') {
    const view = renderTaskDigest(await collectTaskDigest(userId, rules, zone), settings);
    await edit(callback, token, view || { text: tr(settings, 'noDigestTasks') });
    return answer(tr(settings, 'updated'));
  }
  if (!mongoose.isValidObjectId(id) || !['select', 'done', 'drop', 'mute'].includes(action)) return answer(tr(settings, 'taskUnavailable'));
  const task = await Task.findOne({ _id: id, user: userId, ...eligible });
  if (!task) return answer(tr(settings, 'taskUnavailable'));
  if (action !== 'select') {
    try {
      if (action === 'done') await executeTask(userId, id, 'done', { channel: 'telegram' });
      if (action === 'drop') { await executeTask(userId, id, 'drop', { channel: 'telegram' }); await archiveTask(userId, id); }
      if (action === 'mute') await updateTask(userId, id, { taskReminderState: 'muted' });
    } catch (error) {
      if ([404, 409].includes(error.status)) return answer(tr(settings, 'taskUnavailable'));
      throw error;
    }
    const view = renderTaskDigest(await collectTaskDigest(userId, rules, zone), settings);
    await edit(callback, token, view || { text: tr(settings, 'noDigestTasks') });
    return answer(tr(settings, action === 'done' ? 'taskCompleted' : action === 'drop' ? 'taskRemoved' : 'remindersMuted'));
  }
  const tasks = await collectTaskDigest(userId, rules, zone);
  const number = digestNumber(tasks, id);
  if (!number) return answer(tr(settings, 'taskUnavailable'));
  await edit(callback, token, {
    text: `📌 <b>${tr(settings, 'digestTask', { number })}</b>\n\n${escapeHtml(task.title)}\n\n${tr(settings, 'digestPriority')}: ${tr(settings, `priority${task.priority[0].toUpperCase()}${task.priority.slice(1)}`)}\n${tr(settings, 'digestDue')}: ${escapeHtml(taskDue(task, zone, settings.language) || tr(settings, 'noDeadline'))}`,
    markup: { inline_keyboard: [
      [{ text: `✅ ${tr(settings, 'done')}`, callback_data: `taskdigest:done:${id}` }],
      [{ text: `🗑 ${tr(settings, 'dropRemove')}`, callback_data: `taskdigest:drop:${id}` }, { text: `🔕 ${tr(settings, 'dontRemind')}`, callback_data: `taskdigest:mute:${id}` }],
      [{ text: `‹ ${tr(settings, 'back')}`, callback_data: 'taskdigest:back' }],
    ] },
  });
  return answer(tr(settings, 'taskSelected'));
}
