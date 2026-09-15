import { describe, expect, it } from 'vitest';
import { parseAmount, parseTelegramMessage } from '../src/telegram/parser.js';
import { isTelegramUserAllowed } from '../src/telegram/handler.js';

describe('Telegram parser', () => {
  it.each([['1,500', 1500], ['15k', 15000], ['20K', 20000], ['450', 450]])('parses %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it('parses an expense and infers a category', () => expect(parseTelegramMessage('spent 450 coffee')).toMatchObject({ intent: 'CREATE_EXPENSE', data: { amount: 450, category: 'Food', description: 'coffee' } }));
  it('parses receivables without changing balances', () => expect(parseTelegramMessage('Ahmed owes me 5000')).toMatchObject({ intent: 'CREATE_RECEIVABLE', data: { personName: 'Ahmed', originalAmount: 5000 } }));
  it('parses task dates', () => { const result = parseTelegramMessage('task call dentist tomorrow'); expect(result.intent).toBe('CREATE_TASK'); expect(result.data.dueDate).toBeInstanceOf(Date); });
  it('returns UNKNOWN for ambiguous text', () => expect(parseTelegramMessage('hello there').intent).toBe('UNKNOWN'));
  it('authorizes only configured Telegram UIDs', () => {
    const settings = { telegram: { allowedTelegramUserIds: [123456789] } };
    expect(isTelegramUserAllowed(settings, 123456789)).toBe(true);
    expect(isTelegramUserAllowed(settings, 987654321)).toBe(false);
  });
});
