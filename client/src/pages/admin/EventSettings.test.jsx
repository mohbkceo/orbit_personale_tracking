// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminEventSettings from './EventSettings.jsx';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
const settings = {
  provider: { name: 'dzevent', enabled: true, configured: true, keySource: 'database', lastConnectionTestAt: null, lastConnectionTestSuccess: null },
  integration: { enabled: true, syncEnabled: true, syncIntervalMinutes: 120, pageLimit: 100 },
  catalog: { enabled: true, allowedWilayas: [], allowedCategories: [], allowedTypes: [], allowedFormats: [] },
  discovery: { enabled: true, defaultEnabled: false, maxNotificationsPerDay: 3, minimumSpacingMinutes: 360, bundleEnabled: true, bundleWindowMinutes: 360, maxEventsPerBundle: 5, minimumLeadMinutes: 1440 },
  reminders: { enabled: true, defaultOffsetsMinutes: [1440, 120], userCanCustomize: true, maxPerEvent: 3, minOffsetMinutes: 15, maxOffsetMinutes: 43200 },
  changes: { enabled: true, startTime: true }, delivery: { telegram: true, web: true, defaultChannels: ['telegram'] },
  quietHours: { policy: 'move_earlier', userCanOverride: true }, userControls: { follow: true }, limits: { maxFollowedEvents: 50, maxActiveEventReminders: 100 },
  sync: { requestsToday: 0 },
};
beforeEach(() => {
  api.get.mockImplementation((path) => Promise.resolve({ data: path.endsWith('/metrics') ? { cachedEvents: 3 } : settings }));
  api.put.mockResolvedValue({ data: settings });
  api.post.mockResolvedValue({ data: { success: true, message: 'Connection successful' } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('Admin Event Settings', () => {
  it('keeps the API key input empty and excludes it from a blank settings save', async () => {
    render(<AdminEventSettings />);
    await screen.findByText('DZ Event API key');
    expect(screen.getByLabelText('DZ Event API key').value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save event settings' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('apiKey');
  });
  it('tests the connection and refreshes the displayed result', async () => {
    render(<AdminEventSettings />);
    await screen.findByText('DZ Event API key');
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/settings/events/test'));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('status').textContent).toContain('Connection successful');
  });
});
