import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { parseReminderCommand } from './reminderParser.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const amountToken = '-?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)[kK]?';
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const result = (intent, data = {}) => ({ intent, confidence: 1, data });

export function parseAmount(raw) {
  if (!raw || !new RegExp(`^${amountToken}$`).test(String(raw))) return null;
  const value = String(raw).replaceAll(',', '').toLowerCase();
  const parsed = Number(value.replace(/k$/, '')) * (value.endsWith('k') ? 1000 : 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseNaturalDate(text, now = dayjs()) {
  const input = String(text).toLowerCase();
  if (/\btoday\b/.test(input)) return now.startOf('day').toDate();
  if (/\btomorrow\b/.test(input)) return now.add(1, 'day').startOf('day').toDate();
  if (/\byesterday\b/.test(input)) return now.subtract(1, 'day').startOf('day').toDate();
  const index = days.findIndex((day) => new RegExp(`\\b${day}\\b`).test(input));
  if (index < 0) return null;
  let add = (index - now.day() + 7) % 7;
  if (add === 0 || input.includes(`next ${days[index]}`)) add += 7;
  return now.add(add, 'day').startOf('day').toDate();
}

function dateData(raw, options) {
  const zone = options.timezone || 'Africa/Algiers';
  const date = parseNaturalDate(raw, dayjs(options.now || new Date()).tz(zone));
  return date ? new Date(`${dayjs(date).tz(zone).format('YYYY-MM-DD')}T00:00:00.000Z`) : null;
}

function taskData(raw, options) {
  const priority = raw.match(/\b(low|medium|high|urgent)\b/i)?.[1]?.toLowerCase() || 'medium';
  const clock = raw.match(/\b(?:(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[ap]m)?|(?:1[0-2]|0?[1-9])\s*[ap]m)\b/i)?.[0];
  let dueTime = '';
  if (clock) {
    const parts = clock.replace(/\s/g, '').match(/^(\d{1,2})(?::(\d{2}))?([ap]m)?$/i);
    if (parts) {
      let hour = Number(parts[1]);
      if (parts[3]) hour = (hour % 12) + (parts[3].toLowerCase() === 'pm' ? 12 : 0);
      dueTime = `${String(hour).padStart(2, '0')}:${parts[2] || '00'}`;
    }
  }
  const title = raw.replace(/\b(low|medium|high|urgent)\b/gi, '')
    .replace(/\b(?:today|tomorrow|yesterday|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
    .replace(clock || /(?!)x/, '').replace(/\s+/g, ' ').trim();
  return { title, dueDate: dateData(raw, options), dueTime, priority };
}

function debtData(raw, intent, options) {
  const match = raw.match(new RegExp(`^(.+?)\\s+(${amountToken})(?:\\s+(.+))?$`, 'i'));
  if (!match) return result(intent, { personName: raw.trim(), originalAmount: null, description: '' });
  return result(intent, { personName: match[1].trim(), originalAmount: parseAmount(match[2]), description: match[3]?.trim() || '', dueDate: dateData(match[3] || '', options) });
}

function saleData(raw) {
  const match = raw.match(new RegExp(`^(${amountToken})(?:\\s+([\\s\\S]*))?$`, 'i'));
  if (!match) return result('CREATE_SALE', { amount: null, description: 'Sale', saleDetails: { quantity: 1 } });
  let product = match[2]?.trim() || '';
  const quantity = Number(product.match(/(?:^|\s)x\s*(\d+)(?=\s|$)/i)?.[1] || 1);
  const business = product.match(/(?:^|\s)#([^\s#@]+)/)?.[1];
  const customerName = product.match(/(?:^|\s)@([^\s#@]+)/)?.[1];
  product = product.replace(/(?:^|\s)x\s*\d+(?=\s|$)/gi, ' ').replace(/(?:^|\s)[#@][^\s#@]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sale';
  return result('CREATE_SALE', { amount: parseAmount(match[1]), description: product, category: 'Sale', saleDetails: { product, quantity, ...(business ? { business } : {}), ...(customerName ? { customerName } : {}) } });
}

function inferCategory(description) {
  const value = description.toLowerCase();
  if (/coffee|food|dinner|lunch|breakfast|restaurant|grocer/.test(value)) return 'Food';
  if (/fuel|taxi|bus|train|transport/.test(value)) return 'Transport';
  if (/internet|electric|water|phone|bill/.test(value)) return 'Bills';
  if (/doctor|medicine|health/.test(value)) return 'Health';
  return 'Other';
}

export function parseTelegramMessage(text, options = {}) {
  const value = String(text || '').trim();
  if (!value) return result('UNKNOWN');
  const command = value.toLowerCase().split(/\s+/)[0];
  const commands = { '/today': 'SHOW_TODAY', '/money': 'SHOW_MONEY', '/debts': 'SHOW_DEBTS', '/tasks': 'SHOW_TASKS', '/sales': 'SHOW_SALES', '/reminders': 'SHOW_REMINDERS' };
  if (commands[command]) return result(commands[command]);
  if (/^show\s+reminders$/i.test(value)) return result('SHOW_REMINDERS');
  let match = value.match(/^remind\s+me\s+(.+)$/i);
  if (match) {
    const reminder = parseReminderCommand(match[1], options);
    if (reminder.intent !== 'CLARIFY_REMINDER') return reminder;
    return parseNaturalDate(match[1]) ? result('CREATE_TASK', taskData(match[1].replace(/^to\s+/i, ''), options)) : reminder;
  }
  match = value.match(/^cancel\s+reminder\s+([a-f\d]{24})$/i);
  if (match) return result('CANCEL_REMINDER', { id: match[1] });
  match = value.match(/^update\s+reminder\s+([a-f\d]{24})\s+(.+)$/i);
  if (match) { const parsed = parseReminderCommand(match[2], options); return parsed.intent === 'CREATE_REMINDER' ? result('UPDATE_REMINDER', { ...parsed.data, id: match[1] }) : parsed; }
  match = value.match(/^(?:t|task|todo)\s+(.+)$/i);
  if (match) return result('CREATE_TASK', taskData(match[1], options));
  if (/^(?:t|task|todo)$/i.test(value)) return result('CREATE_TASK', { title: '' });
  match = value.match(/^din\s+(.+)$/i);
  if (match) return debtData(match[1], 'CREATE_RECEIVABLE', options);
  match = value.match(/^dout\s+(.+)$/i);
  if (match) return debtData(match[1], 'CREATE_PAYABLE', options);
  match = value.match(new RegExp(`^(.+?)\\s+owes\\s+me\\s+(${amountToken})(?:\\s+(.+))?$`, 'i'));
  if (match) return result('CREATE_RECEIVABLE', { personName: match[1].trim(), originalAmount: parseAmount(match[2]), description: match[3] || '' });
  match = value.match(new RegExp(`^i\\s+owe\\s+(.+?)\\s+(${amountToken})(?:\\s+(.+))?$`, 'i'));
  if (match) return result('CREATE_PAYABLE', { personName: match[1].trim(), originalAmount: parseAmount(match[2]), description: match[3] || '' });
  match = value.match(new RegExp(`^(?:dpay\\s+(.+?)|(.+?)\\s+paid\\s+me)\\s+(${amountToken})$`, 'i'));
  if (match) return result('RECORD_RECEIVABLE_PAYMENT', { personName: (match[1] || match[2]).trim(), amount: parseAmount(match[3]) });
  match = value.match(new RegExp(`^(?:dpaid\\s+(.+?)|i\\s+paid\\s+(.+?))\\s+(${amountToken})$`, 'i'));
  if (match) return result('RECORD_PAYABLE_PAYMENT', { personName: (match[1] || match[2]).trim(), amount: parseAmount(match[3]) });
  match = value.match(/^(?:s|sale|sold)(?:\s+(.+))?$/i);
  if (match) return saleData(match[1] || '');
  match = value.match(new RegExp(`^(?:e|spent|expense|paid)\\s+(${amountToken})(?:\\s+(.+))?$`, 'i'));
  if (match) { const description = match[2]?.trim() || ''; return result('CREATE_EXPENSE', { amount: parseAmount(match[1]), description, category: inferCategory(description), date: new Date() }); }
  match = value.match(new RegExp(`^(?:i|income|received|earned)\\s+(${amountToken})(?:\\s+(.+))?$`, 'i'));
  if (match) return result('CREATE_INCOME', { amount: parseAmount(match[1]), description: match[2]?.trim() || '', category: 'Other', date: new Date() });
  return result('UNKNOWN');
}
