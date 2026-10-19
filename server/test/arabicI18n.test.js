import { describe, expect, it } from 'vitest';
import { parseAmount, parseTelegramMessage } from '../src/telegram/parser.js';
import { telegramMessages, telegramText } from '../src/i18n/telegram.js';
import { settingsInput } from '../src/validators/schemas.js';
import { Setting } from '../src/models/Setting.js';
import mongoose from 'mongoose';

describe('shared language preference', () => {
  it('defaults legacy users to English and rejects invalid locales', () => {
    expect(new Setting({ user: new mongoose.Types.ObjectId() }).language).toBe('en');
    expect(settingsInput.safeParse({ language: 'ar' }).success).toBe(true);
    expect(settingsInput.safeParse({ language: 'fr' }).success).toBe(false);
  });
  it('keeps Telegram translation keys and interpolation signatures aligned', () => {
    expect(Object.keys(telegramMessages.ar).sort()).toEqual(Object.keys(telegramMessages.en).sort());
    for (const key of Object.keys(telegramMessages.en)) {
      const signature = (value) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
      expect(signature(telegramMessages.ar[key]), key).toEqual(signature(telegramMessages.en[key]));
    }
    expect(telegramText({ language: 'ar' }, 'priority', { priority: '<high>' })).toContain('&lt;high&gt;');
  });
});

describe('Arabic quick entry', () => {
  it.each([
    ['مهمة اتصل بأحمد غدوة', 'CREATE_TASK'], ['أضف مهمة شراء الحليب', 'CREATE_TASK'],
    ['صرفت ١٢٠٠ دج', 'CREATE_EXPENSE'], ['بعت ٤٥٠٠', 'CREATE_SALE'],
    ['مدخول ۱۵۰۰۰', 'CREATE_INCOME'], ['دين عند أحمد ٣٠٠٠', 'CREATE_RECEIVABLE'],
    ['أنا مدين لكريم 2000', 'CREATE_PAYABLE'], ['مهامي', 'SHOW_TASKS'], ['مصاريفي', 'SHOW_MONEY'],
  ])('parses %s', (input, intent) => expect(parseTelegramMessage(input).intent).toBe(intent));
  it('normalizes both Arabic digit sets', () => {
    expect(parseAmount('١٢٬٥٠٠')).toBe(12500);
    expect(parseAmount('۱۲۵۰۰')).toBe(12500);
  });
  it('asks for a reminder title when only a date and time are given', () => {
    expect(parseTelegramMessage('ذكرني غدوة على 17:00').intent).toBe('CLARIFY_REMINDER');
  });
});
