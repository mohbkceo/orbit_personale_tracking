import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import en from './locales/en.js';
import ar from './locales/ar.js';
import { marketingContent } from './marketingContent.js';

const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[`${prefix}${key}`, child]] : flatten(child, `${prefix}${key}.`));
const signature = (value) => [...value.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]).sort();

describe('locale resources', () => {
  it('has every required namespace in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(['common', 'navigation', 'auth', 'marketing', 'onboarding', 'dashboard', 'tasks', 'finance', 'debts', 'goals', 'reminders', 'events', 'settings', 'pricing', 'checkout', 'telegram', 'errors', 'notifications'].sort());
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
  it('has matching keys and interpolation signatures', () => {
    const english = Object.fromEntries(flatten(en));
    const arabic = Object.fromEntries(flatten(ar));
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(arabic[key].trim(), key).not.toBe('');
      expect(signature(arabic[key]), key).toEqual(signature(value));
    }
  });
  it('has complete marketing page copy in both languages', () => {
    const english = Object.fromEntries(flatten(marketingContent.en));
    const arabic = Object.fromEntries(flatten(marketingContent.ar));
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) expect(arabic[key].trim(), key).not.toBe('');
  });
  it('defines every statically referenced translation key', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === 'admin' || entry.name === 'i18n' || entry.name === 'test' || entry.name.startsWith('Admin')) return [];
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(file) : /\.[jt]sx?$/.test(entry.name) && !entry.name.includes('.test.') ? [file] : [];
    });
    const missing = [];
    for (const file of walk(root)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\bt\(['"]([\w.-]+(?::[\w.-]+)?)['"]/g)) {
        const [namespace, key] = match[1].includes(':') ? match[1].split(':') : ['common', match[1]];
        if (!key.split('.').reduce((value, part) => value?.[part], en[namespace])) missing.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
