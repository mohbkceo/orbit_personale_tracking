import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { finishFocusPlanning, reviewFocusTask } from '../../services/dailyFocus.service.js';
import { telegramRequest } from '../botClient.js';
import { telegramText as tr } from '../../i18n/telegram.js';

export async function handleFocusCallback(callback, userId, token, settings) {
  const [prefix, action, date, taskId] = String(callback.data || '').split(':');
  if (prefix !== 'f') throw new AppError('Invalid focus action', 400);
  let answer;
  if (action === 'done') {
    await finishFocusPlanning(userId, 'telegram');
    answer = tr(settings, 'focusPlanSaved');
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !mongoose.isValidObjectId(taskId)) throw new AppError('Invalid focus action', 400);
    if (action === 'reschedule') {
      await telegramRequest(token, 'sendMessage', { chat_id: callback.message.chat.id, text: tr(settings, 'focusDateHint', { date, taskId }) });
      answer = tr(settings, 'focusChooseDate');
    } else {
      if (!['tomorrow', 'backlog', 'drop'].includes(action)) throw new AppError('Invalid focus action', 400);
      await reviewFocusTask(userId, date, taskId, action, 'telegram');
      answer = tr(settings, action === 'tomorrow' ? 'focusAddedTomorrow' : action === 'drop' ? 'focusTaskDropped' : 'focusReturnedBacklog');
    }
  }
  await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: answer });
}
