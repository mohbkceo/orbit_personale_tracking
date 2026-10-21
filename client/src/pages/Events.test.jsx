// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Events from './Events.jsx';
import { api } from '../api/client.js';
import i18n from '../i18n/index.js';
import { LanguageSelector } from '../i18n/LanguageSelector.jsx';

vi.mock('../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
const event = { _id: 'one', externalId: '21', title: 'Algeria Tech Conference', provider: 'dzevent', startsAt: '2030-10-21T09:00:00.000Z', scheduleStatus: 'scheduled', orbitVisibility: { status: 'visible' }, categories: [], venue: { name: 'CIC Alger' }, providerUrl: 'https://www.dzevent.com/events/test' };
let follows;
let customization;
beforeEach(() => {
  follows = []; customization = true;
  api.get.mockImplementation((path) => Promise.resolve({ data: path === '/events' ? [event] : path === '/events/following' ? follows : { overrides: {}, effective: { reminderOffsetsMinutes: [1440, 120], deliveryChannels: ['telegram'], admin: { integration: { enabled: true }, reminders: { enabled: true, userCanCustomize: customization }, userControls: { reminderTiming: true }, delivery: { telegram: true, web: true } } } } }));
  api.post.mockResolvedValue({ data: {} }); api.delete.mockResolvedValue({ data: {} });
});
afterEach(async () => { cleanup(); vi.clearAllMocks(); localStorage.removeItem('orbit-guest-language'); await i18n.changeLanguage('en'); });
describe('Events page', () => {
  it('follows only after explicit confirmation', async () => {
    render(<Events />);
    await screen.findByText('Algeria Tech Conference');
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(screen.getByText(/1 day before/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/events/21/follow', {}));
  });
  it('hides customization when Admin disables it and lets a follower unfollow', async () => {
    customization = false; follows = [{ _id: 'follow', externalEventId: '21', event }];
    render(<Events />);
    await screen.findByText('Algeria Tech Conference');
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/events/21/follow'));
  });
  it('updates event notification details while the confirmation dialog stays open', async () => {
    render(<><LanguageSelector /><Events /></>);
    await screen.findByText('Algeria Tech Conference');
    fireEvent.click(screen.getByRole('button', { name: 'Notify me' }));
    expect(screen.getByRole('dialog', { name: 'Event notifications' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'إشعارات الأحداث' })).toBeTruthy());
    expect(screen.getByText('✓ قبل يوم واحد')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});
