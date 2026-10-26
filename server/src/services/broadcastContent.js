import { AppError } from '../utils/AppError.js';
import { escapeHtml } from '../telegram/formatters.js';

const allowedVariables = new Set(['firstName', 'fullName', 'planName', 'expiryDate']);
const tags = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'a', 'blockquote', 'tg-spoiler']);
export function safeHttpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname && !url.username && !url.password && url.href.length <= 2048 ? url.href : null; }
  catch { return null; }
}
export function renderBroadcastText(source, variables = {}) {
  const stack = [];
  const segments = String(source).split(/(<[^>]*>)/g);
  let output = '';
  for (const segment of segments) {
    if (!segment) continue;
    if (segment.startsWith('<')) {
      const match = /^<(\/)?([a-z-]+)(?:\s+href="([^"]+)")?>$/.exec(segment);
      if (!match || !tags.has(match[2]) || (match[3] && match[2] !== 'a')) throw new AppError('Unsupported Telegram formatting', 422);
      const [, closing, tag, href] = match;
      if (closing) {
        if (href || stack.pop() !== tag) throw new AppError('Unbalanced Telegram formatting', 422);
        output += `</${tag}>`;
      } else {
        if (tag === 'a' && !safeHttpsUrl(href)) throw new AppError('Telegram links must use HTTPS', 422);
        if (tag !== 'a' && href) throw new AppError('Unsupported Telegram formatting', 422);
        stack.push(tag);
        output += tag === 'a' ? `<a href="${escapeHtml(href)}">` : `<${tag}>`;
      }
    } else {
      if (segment.includes('>')) throw new AppError('Invalid Telegram formatting', 422);
      output += escapeHtml(segment.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_whole, key) => {
        if (!allowedVariables.has(key)) throw new AppError(`Unsupported variable: ${key}`, 422);
        return String(variables[key] ?? '—');
      }));
    }
  }
  if (stack.length) throw new AppError('Unbalanced Telegram formatting', 422);
  if (output.replace(/<[^>]+>/g, '').length > 4096) throw new AppError('Telegram message exceeds 4096 characters', 422);
  return output;
}
export function telegramKeyboard(rows, campaignId, { promotional = false, language = 'en' } = {}) {
  const prepared = [...(rows || [])];
  if (promotional && !prepared.flat().some((button) => button.action === 'PROMO_OPTOUT')) prepared.push([{ label: language === 'ar' ? 'إيقاف الرسائل الترويجية' : 'Opt out of promotions', action: 'PROMO_OPTOUT' }]);
  if (!prepared.length) return undefined;
  return { inline_keyboard: prepared.map((row) => row.map((button) => {
    if (button.url) return { text: button.label, url: safeHttpsUrl(button.url) };
    return { text: button.label, callback_data: `b:${button.action === 'PROMO_OPTOUT' ? 'optout' : 'ack'}:${campaignId}` };
  })) };
}
export function broadcastParts(campaign, language, variables) {
  const text = renderBroadcastText(campaign.variants?.[language]?.text || campaign.variants.en.text, variables);
  const keyboard = telegramKeyboard(campaign.buttons, campaign._id, { promotional: campaign.category !== 'IMPORTANT_NOTICE', language });
  const visibleLength = text.replace(/<[^>]+>/g, '').length;
  return campaign.imageId
    ? { photo: { caption: visibleLength <= 900 ? text : '', keyboard: visibleLength <= 900 ? keyboard : undefined }, text: visibleLength <= 900 ? null : { text, keyboard } }
    : { photo: null, text: { text, keyboard } };
}
