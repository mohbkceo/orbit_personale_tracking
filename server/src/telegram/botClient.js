import { AppError } from '../utils/AppError.js';

export async function telegramRequest(token, method, body = {}) {
  if (!token) throw new AppError('Telegram bot token is not configured', 400);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new AppError(result.description || 'Telegram API request failed', 502);
  return result.result;
}

export const sendMessage = (token, chatId, text, replyMarkup) => telegramRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
