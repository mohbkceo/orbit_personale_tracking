import dayjs from 'dayjs';

export const formatMoney = (amount = 0, currency = 'DZD', compact = false) => new Intl.NumberFormat('en-DZ', { style: 'currency', currency, maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(Number(amount) || 0);
export const formatDate = (date, fallback = 'No date') => date ? dayjs(date).format('D MMM YYYY') : fallback;
export const todayInput = () => dayjs().format('YYYY-MM-DD');
export const cn = (...values) => values.filter(Boolean).join(' ');
