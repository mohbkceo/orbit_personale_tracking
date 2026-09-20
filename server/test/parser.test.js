import { describe, expect, it } from 'vitest';
import { parseAmount, parseTelegramMessage } from '../src/telegram/parser.js';

describe('Telegram parser', () => {
  it.each([['1,500', 1500], ['15k', 15000], ['20K', 20000], ['450', 450]])('parses %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it('parses an expense and infers a category', () => expect(parseTelegramMessage('spent 450 coffee')).toMatchObject({ intent: 'CREATE_EXPENSE', data: { amount: 450, category: 'Food', description: 'coffee' } }));
  it('parses receivables without changing balances', () => expect(parseTelegramMessage('Ahmed owes me 5000')).toMatchObject({ intent: 'CREATE_RECEIVABLE', data: { personName: 'Ahmed', originalAmount: 5000 } }));
  it('parses task dates', () => { const result = parseTelegramMessage('task call dentist tomorrow'); expect(result.intent).toBe('CREATE_TASK'); expect(result.data.dueDate).toBeInstanceOf(Date); });
  it('returns UNKNOWN for ambiguous text', () => expect(parseTelegramMessage('hello there').intent).toBe('UNKNOWN'));
  it.each([
    ['t Call supplier tomorrow', 'CREATE_TASK', { title: 'Call supplier' }],
    ['t Send invoice friday 14:00 high', 'CREATE_TASK', { title: 'Send invoice', dueTime: '14:00', priority: 'high' }],
    ['din Ahmed 5000', 'CREATE_RECEIVABLE', { personName: 'Ahmed', originalAmount: 5000 }],
    ['din Ahmed Benali 5000 plaque order', 'CREATE_RECEIVABLE', { personName: 'Ahmed Benali', description: 'plaque order' }],
    ['dout Printer Shop 8000 acrylic', 'CREATE_PAYABLE', { personName: 'Printer Shop', originalAmount: 8000 }],
    ['dpay Ahmed 2000', 'RECORD_RECEIVABLE_PAYMENT', { personName: 'Ahmed', amount: 2000 }],
    ['dpaid Karim 1000', 'RECORD_PAYABLE_PAYMENT', { personName: 'Karim', amount: 1000 }],
    ['s 12500', 'CREATE_SALE', { amount: 12500, description: 'Sale' }],
    ['s 12500 Stand x3', 'CREATE_SALE', { amount: 12500, saleDetails: { quantity: 3 } }],
    ['s 12500 Stand x3 #Logix @Ahmed', 'CREATE_SALE', { saleDetails: { business: 'Logix', customerName: 'Ahmed' } }],
    ['e 650 lunch', 'CREATE_EXPENSE', { amount: 650 }],
    ['i 15000 freelance', 'CREATE_INCOME', { amount: 15000 }],
    ['s 12.5k Stand', 'CREATE_SALE', { amount: 12500 }],
  ])('quick entry %s', (input, intent, data) => expect(parseTelegramMessage(input)).toMatchObject({ intent, data }));
  it.each(['0', '-5', 'abc'])('rejects invalid amount %s', (input) => expect(parseAmount(input)).toBeNull());
  it.each([['9am', '09:00'], ['9pm', '21:00'], ['9:30am', '09:30'], ['9:30pm', '21:30']])('normalizes task time %s', (time, expected) => {
    const parsed = parseTelegramMessage(`t Call supplier next monday ${time} urgent`);
    expect(parsed.data).toMatchObject({ title: 'Call supplier', dueTime: expected, priority: 'urgent' });
    expect(parsed.data.dueDate).toBeInstanceOf(Date);
  });
});
