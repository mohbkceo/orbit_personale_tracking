import mongoose from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { finishFocusPlanning, reviewFocusTask } from '../../services/dailyFocus.service.js';
import { telegramRequest } from '../botClient.js';

export async function handleFocusCallback(callback, userId, token) {
  const [prefix, action, date, taskId] = String(callback.data || '').split(':');
  if (prefix !== 'f') throw new AppError('Invalid focus action', 400);
  let answer;
  if (action === 'done') {
    await finishFocusPlanning(userId, 'telegram');
    answer = 'Focus plan saved';
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !mongoose.isValidObjectId(taskId)) throw new AppError('Invalid focus action', 400);
    if (action === 'reschedule') {
      await telegramRequest(token, 'sendMessage', { chat_id: callback.message.chat.id, text: `Send /focusdate ${date} ${taskId} YYYY-MM-DD to choose a new date.` });
      answer = 'Choose a date';
    } else {
      if (!['tomorrow', 'backlog', 'drop'].includes(action)) throw new AppError('Invalid focus action', 400);
      await reviewFocusTask(userId, date, taskId, action, 'telegram');
      answer = action === 'tomorrow' ? 'Added to tomorrow’s focus' : action === 'drop' ? 'Task dropped' : 'Returned to backlog';
    }
  }
  await telegramRequest(token, 'answerCallbackQuery', { callback_query_id: callback.id, text: answer });
}
