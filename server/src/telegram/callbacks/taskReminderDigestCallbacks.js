import mongoose from 'mongoose';
import { Task } from '../../models/Task.js';
import { getAutomationSettings, automationTimezone } from '../../services/automationSettings.service.js';
import { getSettingsDocument } from '../../services/settingsService.js';
import { collectTaskDigest, digestNumber, renderTaskDigest } from '../../services/taskReminderDigest.service.js';
import { executeTask } from '../../services/taskExecution.service.js';
import { archiveTask, updateTask } from '../../services/taskService.js';
import { escapeHtml, taskDue } from '../formatters.js';
import { telegramRequest } from '../botClient.js';

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
    const view = renderTaskDigest(await collectTaskDigest(userId, rules, zone));
    await edit(callback, token, view || { text: 'No tasks to remind you about.' });
    return answer('Updated');
  }
  if (!mongoose.isValidObjectId(id) || !['select', 'done', 'drop', 'mute'].includes(action)) return answer('This task is no longer available.');
  const task = await Task.findOne({ _id: id, user: userId, ...eligible });
  if (!task) return answer('This task is no longer available.');
  if (action !== 'select') {
    try {
      if (action === 'done') await executeTask(userId, id, 'done', { channel: 'telegram' });
      if (action === 'drop') { await executeTask(userId, id, 'drop', { channel: 'telegram' }); await archiveTask(userId, id); }
      if (action === 'mute') await updateTask(userId, id, { taskReminderState: 'muted' });
    } catch (error) {
      if ([404, 409].includes(error.status)) return answer('This task is no longer available.');
      throw error;
    }
    const view = renderTaskDigest(await collectTaskDigest(userId, rules, zone));
    await edit(callback, token, view || { text: 'No tasks to remind you about.' });
    return answer(action === 'done' ? 'Task completed' : action === 'drop' ? 'Task removed' : 'Task reminders muted');
  }
  const tasks = await collectTaskDigest(userId, rules, zone);
  const number = digestNumber(tasks, id);
  if (!number) return answer('This task is no longer available.');
  await edit(callback, token, {
    text: `📌 <b>Task ${number}</b>\n\n${escapeHtml(task.title)}\n\nPriority: ${escapeHtml(task.priority[0].toUpperCase() + task.priority.slice(1))}\nDue: ${escapeHtml(taskDue(task, zone) || 'No deadline')}`,
    markup: { inline_keyboard: [
      [{ text: '✅ Done', callback_data: `taskdigest:done:${id}` }],
      [{ text: '🗑 Drop & Remove', callback_data: `taskdigest:drop:${id}` }, { text: "🔕 Don't remind me", callback_data: `taskdigest:mute:${id}` }],
      [{ text: '‹ Back', callback_data: 'taskdigest:back' }],
    ] },
  });
  return answer('Task selected');
}
