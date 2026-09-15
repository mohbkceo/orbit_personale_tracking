import dayjs from 'dayjs';

const amountPattern = '(\\d[\\d,]*(?:\\.\\d+)?[kK]?)';

export function parseAmount(raw) {
  if (!raw) return null;
  const normalized = raw.replaceAll(',', '').toLowerCase();
  const value = Number.parseFloat(normalized.replace('k', ''));
  return Number.isFinite(value) ? value * (normalized.endsWith('k') ? 1000 : 1) : null;
}

export function parseNaturalDate(text, now = dayjs()) {
  const input = text.toLowerCase();
  if (/\btoday\b/.test(input)) return now.startOf('day').toDate();
  if (/\btomorrow\b/.test(input)) return now.add(1, 'day').startOf('day').toDate();
  if (/\byesterday\b/.test(input)) return now.subtract(1, 'day').startOf('day').toDate();
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = days.findIndex((day) => new RegExp(`\\b${day}\\b`).test(input));
  if (dayIndex >= 0) {
    let add = (dayIndex - now.day() + 7) % 7;
    if (add === 0 || input.includes(`next ${days[dayIndex]}`)) add += 7;
    return now.add(add, 'day').startOf('day').toDate();
  }
  return null;
}

function cleanDescription(text) {
  return text.replace(/\b(today|tomorrow|yesterday|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '').replace(/\s+/g, ' ').trim();
}

function inferCategory(description) {
  const value = description.toLowerCase();
  if (/coffee|food|dinner|lunch|breakfast|restaurant|grocer/.test(value)) return 'Food';
  if (/fuel|taxi|bus|train|transport/.test(value)) return 'Transport';
  if (/internet|electric|water|phone|bill/.test(value)) return 'Bills';
  if (/doctor|medicine|health/.test(value)) return 'Health';
  return 'Other';
}

export function parseTelegramMessage(text) {
  const value = String(text || '').trim();
  if (!value) return { intent: 'UNKNOWN', confidence: 0, data: {} };
  const command = value.toLowerCase().split(/\s+/)[0];
  const commandMap = { '/today': 'SHOW_TODAY', '/money': 'SHOW_MONEY', '/debts': 'SHOW_DEBTS' };
  if (commandMap[command]) return { intent: commandMap[command], confidence: 1, data: {} };

  let match = value.match(new RegExp(`^(?:spent|expense|paid)\\s+${amountPattern}\\s+(.+)$`, 'i'));
  if (match) { const description = cleanDescription(match[2]); return { intent: 'CREATE_EXPENSE', confidence: 0.98, data: { amount: parseAmount(match[1]), description, category: inferCategory(description), date: parseNaturalDate(value) || new Date() } }; }
  match = value.match(new RegExp(`^(?:income|received|earned)\\s+${amountPattern}\\s+(.+)$`, 'i'));
  if (match) return { intent: 'CREATE_INCOME', confidence: 0.98, data: { amount: parseAmount(match[1]), description: cleanDescription(match[2]), category: 'Other', date: parseNaturalDate(value) || new Date() } };
  match = value.match(new RegExp(`^(.+?)\\s+owes\\s+me\\s+${amountPattern}(?:\\s+(.+))?$`, 'i'));
  if (match) return { intent: 'CREATE_RECEIVABLE', confidence: 0.99, data: { personName: match[1].trim(), originalAmount: parseAmount(match[2]), description: match[3] || '', dueDate: parseNaturalDate(value) } };
  match = value.match(new RegExp(`^i\\s+owe\\s+(.+?)\\s+${amountPattern}(?:\\s+(.+))?$`, 'i'));
  if (match) return { intent: 'CREATE_PAYABLE', confidence: 0.99, data: { personName: match[1].trim(), originalAmount: parseAmount(match[2]), description: match[3] || '', dueDate: parseNaturalDate(value) } };
  match = value.match(new RegExp(`^(.+?)\\s+paid\\s+me\\s+${amountPattern}`, 'i'));
  if (match) return { intent: 'RECORD_RECEIVABLE_PAYMENT', confidence: 0.98, data: { personName: match[1].trim(), amount: parseAmount(match[2]) } };
  match = value.match(new RegExp(`^i\\s+paid\\s+(.+?)\\s+${amountPattern}`, 'i'));
  if (match) return { intent: 'RECORD_PAYABLE_PAYMENT', confidence: 0.98, data: { personName: match[1].trim(), amount: parseAmount(match[2]) } };
  match = value.match(/^(?:task|todo)\s+(.+)$/i) || value.match(/^remind\s+me\s+(.+)$/i);
  if (match) return { intent: 'CREATE_TASK', confidence: 0.97, data: { title: cleanDescription(match[1].replace(/^tomorrow\s+to\s+/i, '')), dueDate: parseNaturalDate(value), priority: 'medium' } };
  return { intent: 'UNKNOWN', confidence: 0, data: {} };
}
