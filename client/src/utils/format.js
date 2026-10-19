import dayjs from 'dayjs';
import i18n from '../i18n/index.js';

const locale = (language) => (language || i18n.resolvedLanguage) === 'ar' ? 'ar-DZ' : 'en-DZ';
export const formatMoney = (amount = 0, currency = 'DZD', compact = false, language) => new Intl.NumberFormat(locale(language), { style: 'currency', currency, maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(Number(amount) || 0);
export const formatNumber = (amount = 0, options = {}, language) => new Intl.NumberFormat(locale(language), options).format(Number(amount) || 0);
export const formatDate = (date, fallback, options = {}) => date ? new Intl.DateTimeFormat(locale(options.language), { day: 'numeric', month: 'short', year: 'numeric', ...(options.timezone ? { timeZone: options.timezone } : {}) }).format(new Date(date)) : fallback ?? i18n.t('noDate');
export const todayInput = () => dayjs().format('YYYY-MM-DD');
export const cn = (...values) => values.filter(Boolean).join(' ');
