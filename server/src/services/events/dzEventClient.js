import { EventSettings } from '../../models/EventSettings.js';
import { getDzEventApiKey, getEventSettings } from './eventSettingsService.js';

export class DzEventError extends Error {
  constructor(publicMessage, status = 502, retryAfterSeconds = 0) {
    super(publicMessage);
    this.name = 'DzEventError';
    this.publicMessage = publicMessage;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const filterPattern = /^[\p{L}\p{N}-]{1,80}$/u;
function retryAfterSeconds(value) {
  const seconds = Number(value);
  const parsed = Number.isFinite(seconds) ? seconds : (Date.parse(value) - Date.now()) / 1000;
  return Math.min(86400, Math.max(60, Number.isFinite(parsed) ? Math.ceil(parsed) : 60));
}
export async function fetchDzEvents(filters = {}, { apiKey, recordRequest = true } = {}) {
  const { value: settings } = await getEventSettings();
  const key = apiKey || (await getDzEventApiKey()).key;
  if (!key) throw new DzEventError('DZ Event API key is not configured', 503);
  for (const field of Object.keys(filters)) if (!['wilaya', 'type', 'category', 'format', 'page', 'limit'].includes(field)) throw new DzEventError('Unsupported DZ Event filter', 400);
  const url = new URL('https://www.dzevent.com/api/v1/events');
  for (const field of ['wilaya', 'type', 'category', 'format']) {
    if (filters[field] === undefined || filters[field] === '') continue;
    if (typeof filters[field] !== 'string' || !filterPattern.test(filters[field])) throw new DzEventError(`Invalid ${field} filter`, 400);
    if (field === 'format' && !['physical', 'in-person', 'online'].includes(filters[field])) throw new DzEventError('Invalid format filter', 400);
    url.searchParams.set(field, filters[field]);
  }
  const page = Number(filters.page ?? 1);
  const limit = Number(filters.limit ?? settings.integration.pageLimit);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1) throw new DzEventError('Invalid pagination', 400);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(Math.min(limit, settings.integration.pageLimit, 100)));
  const day = new Date().toISOString().slice(0, 10);
  const hour = new Date().toISOString().slice(0, 13);
  if (recordRequest && settings.sync.requestDay === day && settings.sync.requestsToday >= 450 || recordRequest && settings.sync.requestHour === hour && settings.sync.requestsHour >= 80) throw new DzEventError('Orbit provider request budget reached', 429, 3600);
  let response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new DzEventError('DZ Event is temporarily unreachable', 503);
  } finally {
    if (recordRequest) {
      await EventSettings.updateOne({ key: 'global', 'sync.requestDay': { $ne: day } }, { $set: { 'sync.requestDay': day, 'sync.requestsToday': 0 } }).catch(() => {});
      await EventSettings.updateOne({ key: 'global', 'sync.requestHour': { $ne: hour } }, { $set: { 'sync.requestHour': hour, 'sync.requestsHour': 0 } }).catch(() => {});
      await EventSettings.updateOne({ key: 'global' }, { $inc: { 'sync.requestsToday': 1, 'sync.requestsHour': 1 } }).catch(() => {});
    }
  }
  if (response.status === 401) throw new DzEventError('Authentication failed', 401);
  if (response.status === 429) {
    const waitSeconds = retryAfterSeconds(response.headers.get('retry-after'));
    await EventSettings.updateOne({ key: 'global' }, { $set: { 'sync.rateLimitedUntil': new Date(Date.now() + waitSeconds * 1000) } }).catch(() => {});
    throw new DzEventError('DZ Event rate limit reached', 429, waitSeconds);
  }
  if (!response.ok) throw new DzEventError(response.status >= 500 ? 'DZ Event is temporarily unavailable' : 'DZ Event rejected the request', 502);
  let body;
  try { body = await response.json(); } catch { throw new DzEventError('DZ Event returned an invalid response', 502); }
  if (!body || !Array.isArray(body.data)) throw new DzEventError('DZ Event returned an invalid response', 502);
  return { data: body.data, pagination: body.pagination || {} };
}
