import dayjs from 'dayjs';
import i18n from '../i18n/index.js';

const locale = (language) => (language || i18n.resolvedLanguage) === 'ar' ? 'ar-DZ' : 'en-DZ';
let preferences = { timezone: 'Africa/Algiers', dateFormat: 'DD MMM YYYY' };
export const setFormatPreferences = (settings = {}) => { preferences = { timezone: settings.timezone || 'Africa/Algiers', dateFormat: settings.dateFormat || 'DD MMM YYYY' }; };
export const formatMoney = (amount = 0, currency = 'DZD', compact = false, language) => new Intl.NumberFormat(locale(language), { style: 'currency', currency, maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(Number(amount) || 0);
export const formatNumber = (amount = 0, options = {}, language) => new Intl.NumberFormat(locale(language), options).format(Number(amount) || 0);
export const formatMonth = (shortEnglishName, language) => {
  const index = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(shortEnglishName);
  return index < 0 ? shortEnglishName : new Intl.DateTimeFormat(locale(language), { month: 'short' }).format(new Date(Date.UTC(2024, index, 1)));
};
export const formatDate = (date, fallback, options = {}) => {
  if (!date) return fallback ?? i18n.t('noDate');
  const language = locale(options.language);
  const timeZone = options.timezone || preferences.timezone;
  const format = options.dateFormat || preferences.dateFormat;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return fallback ?? i18n.t('noDate');
  if (format === 'YYYY-MM-DD' || format === 'MM/DD/YYYY') {
    const parts = Object.fromEntries(new Intl.DateTimeFormat(language, { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).map(({ type, value: part }) => [type, part]));
    return format === 'YYYY-MM-DD' ? `${parts.year}-${parts.month}-${parts.day}` : `${parts.month}/${parts.day}/${parts.year}`;
  }
  return new Intl.DateTimeFormat(language, { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(value);
};
export const formatDateTime = (date, fallback, options = {}) => date ? `${formatDate(date, fallback, options)} · ${new Intl.DateTimeFormat(locale(options.language), { timeZone: options.timezone || preferences.timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(date))}` : fallback ?? i18n.t('noDate');
export const displayValue = (value, language) => {
  const key = `common:values.${String(value)}`;
  return i18n.exists(key, { lng: language || i18n.resolvedLanguage }) ? i18n.t(key, { lng: language || i18n.resolvedLanguage }) : String(value).replaceAll('_', ' ');
};
export const todayInput = () => dayjs().format('YYYY-MM-DD');
export const cn = (...values) => values.filter(Boolean).join(' ');
