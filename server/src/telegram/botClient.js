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

export const sendMessage = (token, chatId, text, replyMarkup) => {
  const value = String(text);
  const cutoff = value.lastIndexOf('\n', 3900);
  const safeText = value.length <= 4000 ? value : cutoff > 0 ? `${value.slice(0, cutoff)}\n…` : `${value.replace(/<[^>]*>/g, '').slice(0, 3900).replace(/&[^;]*$/, '')}…`;
  return telegramRequest(token, 'sendMessage', { chat_id: chatId, text: safeText, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
};
