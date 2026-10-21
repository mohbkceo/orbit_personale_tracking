import { describe, expect, it } from 'vitest';
import i18n from './index.js';
import { displayValue, formatDateTime, formatMoney, formatMonth, formatNumber, setFormatPreferences } from '../utils/format.js';
import { planDuration, planFeature, planName } from '../utils/planDisplay.js';

describe('localized dynamic presentation', () => {
  it('formats dates in the configured timezone and date format', () => {
    setFormatPreferences({ timezone: 'Africa/Algiers', dateFormat: 'YYYY-MM-DD' });
    expect(formatDateTime('2030-04-03T23:30:00.000Z', '', { language: 'en' })).toContain('2030-04-04');
    setFormatPreferences({ timezone: 'Africa/Algiers', dateFormat: 'DD MMM YYYY' });
  });
  it('localizes canonical values, counts, money and seeded plan copy', () => {
    const arabic = i18n.getFixedT('ar');
    expect(displayValue('in_progress', 'ar')).toBe('قيد التنفيذ');
    expect(formatNumber(1234, {}, 'ar')).toBeTruthy();
    expect(formatMoney(2500, 'DZD', false, 'ar')).toContain('2');
    expect(formatMonth('Oct', 'ar')).not.toBe('Oct');
    expect(planName({ slug: 'plus', name: 'Plus' }, arabic)).toBe('بلس');
    expect(planFeature({ key: 'tasks', type: 'UNLIMITED', name: 'Tasks' }, arabic)).toContain('المهام');
    expect(planDuration({ slug: 'starter', durationValue: 30, durationUnit: 'DAY' }, arabic)).toContain('يومًا');
  });
});
