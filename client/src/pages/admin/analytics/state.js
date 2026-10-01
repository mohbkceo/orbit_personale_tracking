import { EVENTS } from '../../../analytics/events.js';

const dayMs = 86400000;
const isoDay = (date) => new Date(date).toISOString().slice(0, 10);
const validDay = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  isoDay(`${value}T00:00:00Z`) === value;
export const models = {
  firstTouch: 'First touch',
  lastTouch: 'Last touch',
  lastNonDirectTouch: 'Last non-direct',
};
export const channels = ['direct', 'organic_search', 'paid_search', 'organic_social', 'paid_social', 'referral', 'email', 'creator', 'affiliate', 'display', 'other', 'unknown'];
export const conversionNames = [EVENTS.REGISTRATION_COMPLETED, EVENTS.ACCESS_ACTIVATED];
export const filterKeys = [
  'channel',
  'source',
  'medium',
  'campaign',
  'content',
  'term',
  'id',
  'conversion',
];
export const filterLabels = {
  channel: 'Channel',
  source: 'Source',
  medium: 'Medium',
  campaign: 'Campaign',
  content: 'Creative',
  term: 'Term',
  id: 'UTM ID',
  conversion: 'Conversion',
};

export function readAnalyticsState(search, today = new Date()) {
  const params = new URLSearchParams(search);
  const end = isoDay(today);
  const start = isoDay(new Date(Date.parse(`${end}T00:00:00Z`) - 29 * dayMs));
  const from = validDay(params.get('from')) ? params.get('from') : start;
  const to = validDay(params.get('to')) ? params.get('to') : end;
  const filters = Object.fromEntries(
    filterKeys
      .map((key) => [key, (params.get(key) || '').slice(0, 160).trim()])
      .filter(([key, value]) => value && (key !== 'channel' || channels.includes(value)) && (key !== 'conversion' || conversionNames.includes(value))),
  );
  return {
    from: from <= to ? from : start,
    to: from <= to ? to : end,
    compare: params.get('compare') === 'previous',
    model: Object.hasOwn(models, params.get('model')) ? params.get('model') : 'lastTouch',
    filters,
  };
}

export function reportParams(state, extra = {}) {
  return { from: state.from, to: state.to, model: state.model, ...state.filters, ...extra };
}

export function previousPeriod(state) {
  const start = Date.parse(`${state.from}T00:00:00Z`);
  const end = Date.parse(`${state.to}T00:00:00Z`);
  const days = Math.round((end - start) / dayMs) + 1;
  return {
    ...state,
    from: isoDay(new Date(start - days * dayMs)),
    to: isoDay(new Date(start - dayMs)),
  };
}

export function comparison(current, previous) {
  if (previous == null) return null;
  if (!previous)
    return current ? { text: 'New', direction: 'up' } : { text: 'No change', direction: 'flat' };
  const change = (current - previous) / Math.abs(previous);
  return {
    text: `${change > 0 ? '+' : ''}${new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(change)}`,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

export const count = (value) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);
export const percent = (value) =>
  new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(
    Number(value) || 0,
  );
export const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(value))
    : '—';
export const titleCase = (value) =>
  String(value || 'Unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
