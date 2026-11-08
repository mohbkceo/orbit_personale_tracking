import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareAutomaticTiming, applyAutomaticTiming, automaticTimingFields } from '../src/services/automaticMessageTiming.js';
import { automationDefaults, getAutomationSettings } from '../src/services/automationSettings.service.js';
import { eventDefaults } from '../src/services/events/eventSettingsService.js';
import { AutomationSettings } from '../src/models/AutomationSettings.js';
import { EventSettings } from '../src/models/EventSettings.js';
import { renderAutomaticContent } from '../src/services/automaticMessages.js';

vi.mock('../src/services/automationSettings.service.js', async (original) => {
  const actual = await original();
  return { ...actual, getAutomationSettings: vi.fn(async () => structuredClone(actual.automationDefaults)) };
});
vi.mock('../src/services/events/eventSettingsService.js', async (original) => {
  const actual = await original();
  return { ...actual, getEventSettings: vi.fn(async () => ({ value: structuredClone(actual.eventDefaults) })) };
});
vi.mock('../src/models/AutomationSettings.js', () => ({ AutomationSettings: { updateOne: vi.fn().mockResolvedValue({}) } }));
vi.mock('../src/models/EventSettings.js', () => ({ EventSettings: { updateOne: vi.fn().mockResolvedValue({}) } }));
beforeEach(() => vi.clearAllMocks());

describe('supported reminder timing', () => {
  it('limits the editor to supported timing fields', () => {
    expect(automaticTimingFields('focus-morning', automationDefaults.dailyFocus)).toEqual([{ field: 'morningTime', label: 'Morning reminder', type: 'time', value: '08:00' }]);
    expect(automaticTimingFields('summary-daily', null)).toEqual([]);
    expect(automaticTimingFields('debt-act', null)).toEqual([]);
  });
  it('updates only the chosen field and retains existing worker defaults', async () => {
    const change = await prepareAutomaticTiming('focus-morning', { morningTime: '08:30' });
    await applyAutomaticTiming(change);
    expect(AutomationSettings.updateOne).toHaveBeenLastCalledWith({ key: 'global' }, { $set: { 'value.dailyFocus.morningTime': '08:30' } }, { upsert: true });
    expect(change.defaults).toEqual(automationDefaults);
    expect(await prepareAutomaticTiming('focus-morning', undefined)).toBeNull();
  });
  it('rejects invalid clocks, duplicate digests, unsupported fields, and morning after evening', async () => {
    await expect(prepareAutomaticTiming('focus-morning', { morningTime: '25:00' })).rejects.toThrow('valid reminder timing');
    await expect(prepareAutomaticTiming('focus-morning', { morningTime: '21:00' })).rejects.toThrow('Morning must be before evening');
    await expect(prepareAutomaticTiming('task-digest', { times: ['09:00', '09:00'] })).rejects.toThrow('unique');
    await expect(prepareAutomaticTiming('debt-act', { overdueIntervalHours: 1 })).rejects.toThrow('valid reminder timing');
    await expect(prepareAutomaticTiming('focus-morning', { workerEnabled: false })).rejects.toThrow('valid reminder timing');
    expect(AutomationSettings.updateOne).not.toHaveBeenCalled();
  });
  it('keeps digest priorities and follow-up limits unchanged', async () => {
    expect((await prepareAutomaticTiming('task-digest', { times: ['10:00', '16:00'] })).patch).toEqual({ 'value.taskReminderDigest.times': ['10:00', '16:00'] });
    expect((await prepareAutomaticTiming('focus-followup', { planningReminderIntervalMinutes: 90 })).patch).toEqual({ 'value.dailyFocus.planningReminderIntervalMinutes': 90 });
    expect(getAutomationSettings).toHaveBeenCalledTimes(2);
  });
  it('validates event offsets against current platform limits without touching user overrides', async () => {
    const change = await prepareAutomaticTiming('event-followed', { defaultOffsetsMinutes: [120, 1440] });
    await applyAutomaticTiming(change);
    expect(EventSettings.updateOne).toHaveBeenCalledWith({ key: 'global' }, { $set: { 'reminders.defaultOffsetsMinutes': [1440, 120] } }, { upsert: true });
    expect(eventDefaults.reminders.userCanCustomize).toBe(true);
    await expect(prepareAutomaticTiming('event-followed', { defaultOffsetsMinutes: [15, 30, 60, 120] })).rejects.toThrow('platform limits');
  });
});

describe('unsaved automatic message rendering', () => {
  it('renders samples safely even for a disabled template, without database writes', () => {
    const row = { enabled: false, variants: { en: { title: 'Debt for {personName}', body: '{remainingAmount} {currency}' } }, buttons: [[{ label: 'Open', url: 'https://example.com' }]], imageId: 'image' };
    expect(renderAutomaticContent(row, 'en', {})).toBeNull();
    expect(renderAutomaticContent(row, 'en', { personName: '<Ahmed>', remainingAmount: 2500, currency: 'DZD' }, { preview: true })).toEqual({ title: 'Debt for &lt;Ahmed&gt;', message: '2500 DZD', html: true, imageId: 'image', buttons: [[{ text: 'Open', url: 'https://example.com' }]] });
    expect(AutomationSettings.updateOne).not.toHaveBeenCalled();
  });
});
