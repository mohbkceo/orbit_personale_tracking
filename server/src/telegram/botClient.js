import { AppError } from '../utils/AppError.js';

export async function telegramRequest(token, method, body = {}) {
  if (!token) throw new AppError('Telegram bot token is not configured', 400);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new AppError(result.description || 'Telegram API request failed', 502);
    error.telegramCode = result.error_code || response.status;
    error.retryAfter = Number(result.parameters?.retry_after) || 0;
    throw error;
  }
  return result.result;
}

export const sendMessage = (token, chatId, text, replyMarkup) => {
  const value = String(text);
  const cutoff = value.lastIndexOf('\n', 3900);
  const safeText = value.length <= 4000 ? value : cutoff > 0 ? `${value.slice(0, cutoff)}\n…` : `${value.replace(/<[^>]*>/g, '').slice(0, 3900).replace(/&[^;]*$/, '')}…`;
  return telegramRequest(token, 'sendMessage', { chat_id: chatId, text: safeText, parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
};

export async function sendPhoto(token, chatId, bytes, mimeType, caption = '', replyMarkup) {
  if (!token) throw new AppError('Telegram bot token is not configured', 400);
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('photo', new Blob([bytes], { type: mimeType }), mimeType === 'image/png' ? 'image.png' : 'image.jpg');
  if (caption) { form.set('caption', caption); form.set('parse_mode', 'HTML'); }
  if (replyMarkup) form.set('reply_markup', JSON.stringify(replyMarkup));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new AppError(result.description || 'Telegram photo failed', 502);
    error.telegramCode = result.error_code || response.status;
    error.retryAfter = Number(result.parameters?.retry_after) || 0;
    throw error;
  }
  return result.result;
}
