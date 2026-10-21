import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import en from './locales/en.js';
import ar from './locales/ar.js';
import { marketingContent } from './marketingContent.js';
import { auditUiStrings } from '../../../scripts/check-i18n.mjs';

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
  it('provides every plural form used by the locale catalogs', () => {
    const english = Object.fromEntries(flatten(en));
    const arabic = Object.fromEntries(flatten(ar));
    for (const key of Object.keys(english).filter((entry) => entry.endsWith('_one'))) {
      const base = key.slice(0, -4);
      expect(english[`${base}_other`], base).toBeTruthy();
      for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) expect(arabic[`${base}_${form}`], `${base}_${form}`).toBeTruthy();
    }
  });
  it('has no hardcoded static text, UI attributes, or direct notification copy in public components', () => {
    expect(auditUiStrings()).toEqual([]);
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
      for (const match of source.matchAll(/\b(?:t|_t)\(['"]([\w.-]+(?::[\w.-]+)?)['"]/g)) {
        const [namespace, key] = match[1].includes(':') ? match[1].split(':') : ['common', match[1]];
        if (key.endsWith('.')) continue; // Dynamic suffixes are checked through their catalog parity.
        const value = key.split('.').reduce((resource, part) => resource?.[part], en[namespace]);
        const plural = `${key}_other`.split('.').reduce((resource, part) => resource?.[part], en[namespace]);
        if (!value && !plural) missing.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
