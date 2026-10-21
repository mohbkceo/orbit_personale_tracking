import { describe, expect, it } from 'vitest';
import { telegramMessages, telegramText } from '../src/i18n/telegram.js';
import { helpText, quickMenu } from '../src/telegram/commandHandlers.js';

const signature = (value) => [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();

describe('Telegram localization', () => {
  it('has matching nonempty translations and interpolation values', () => {
    expect(Object.keys(telegramMessages.ar).sort()).toEqual(Object.keys(telegramMessages.en).sort());
    for (const [key, english] of Object.entries(telegramMessages.en)) {
      expect(telegramMessages.ar[key].trim(), key).not.toBe('');
      expect(signature(telegramMessages.ar[key]), key).toEqual(signature(english));
    }
  });
  it('defines Arabic forms for every counted bot message', () => {
    for (const key of Object.keys(telegramMessages.en).filter((entry) => entry.endsWith('_one'))) {
      const base = key.slice(0, -4);
      expect(telegramMessages.en[`${base}_other`], base).toBeTruthy();
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) expect(telegramMessages.ar[`${base}_${form}`], `${base}_${form}`).toBeTruthy();
    }
  });
  it('selects English and Arabic plural forms and escapes external text', () => {
    expect(telegramText({ language: 'en' }, 'bundleTitle', { count: 2 })).toContain('2 things');
    expect(telegramText({ language: 'ar' }, 'bundleTitle', { count: 2 })).toContain('أمران');
    expect(telegramText({ language: 'ar' }, 'nextActionSaved', { title: '<Ahmed & Co>' })).toContain('&lt;Ahmed &amp; Co&gt;');
  });
  it('renders command help and callback labels in the recipient language', () => {
    const english = { language: 'en' };
    const arabic = { language: 'ar' };
    expect(helpText(arabic)).toContain('إدخال سريع');
    expect(helpText(english)).toContain('QUICK ENTRY');
    expect(quickMenu(arabic).markup.inline_keyboard[0][0].text).toContain('مهمة');
    expect(quickMenu(english).markup.inline_keyboard[0][0].text).toContain('Task');
  });
});
