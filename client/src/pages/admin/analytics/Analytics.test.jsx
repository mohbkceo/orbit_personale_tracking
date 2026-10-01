import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdminAnalytics from './Analytics.jsx';

const mockGet = vi.hoisted(() => vi.fn());
vi.mock('../../../api/client.js', () => ({ api: { get: mockGet } }));

const report = {
  overview: {
    visitors: 42,
    sessions: 60,
    newVisitors: 30,
    returningVisitors: 12,
    leads: 5,
    registrations: 4,
    conversions: 3,
    conversionRate: 3 / 42,
    channels: [{ value: 'paid_social', sessions: 40, visitors: 30 }],
    landingPages: [{ _id: '/', sessions: 60 }],
  },
  trend: {
    unit: 'day',
    points: [
      { at: '2026-09-01T00:00:00.000Z', visitors: 4, sessions: 6, leads: 1, conversions: 1 },
    ],
  },
  performance: {
    dimension: 'source',
    model: 'lastTouch',
    rows: [
      { value: 'Meta', visitors: 30, sessions: 40, leads: 5, registrations: 4, conversions: 3 },
      { value: 'Google', visitors: 10, sessions: 12, leads: 0, registrations: 1, conversions: 1 },
    ],
  },
  funnel: {
    steps: [
      { name: 'page_viewed', count: 100 },
      { name: 'registration_completed', count: 40 },
      { name: 'access_activated', count: 20 },
    ],
  },
  conversions: {
    total: 31,
    attribution: {
      firstTouch: [{ _id: 'paid_social', count: 3 }],
      lastTouch: [{ _id: 'direct', count: 3 }],
      lastNonDirectTouch: [{ _id: 'paid_social', count: 3 }],
    },
    rows: [
      {
        eventId: 'access:one',
        name: 'access_activated',
        occurredAt: '2026-09-10T12:00:00Z',
        visitorId: 'visitor-one',
        attribution: {
          firstTouch: { channel: 'paid_social', utmSource: 'Meta' },
          lastTouch: { channel: 'direct' },
          lastNonDirectTouch: { channel: 'paid_social' },
        },
      },
    ],
    pagination: { page: 1, limit: 30, total: 31 },
  },
  product: {
    registrations: 4,
    activationRate: 0.5,
    reachedFirstValue: 2,
    averageTimeToFirstValueMs: 3600000,
    adoption: [{ _id: 'task_created', users: 2 }],
  },
  retention: {
    cohortVisitors: 20,
    retainedVisitors: 5,
    sevenDayRetentionRate: 0.25,
    cohorts: [{ week: '2026-08-31T00:00:00Z', visitors: 20, retained: 5, rate: 0.25 }],
  },
};

function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/admin/analytics/*" element={<AdminAnalytics />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  mockGet.mockImplementation((url, options) => {
    const name = url.split('/').pop();
    if (name === 'source-quality') return Promise.resolve({ data: { model: 'lastTouch', rows: [{ value: 'Meta', registrations: 4, activated: 3, reachedFirstValue: 2, activationRate: .75 }] } });
    if (url.endsWith('/journey'))
      return Promise.resolve({
        data: {
          conversion: report.conversions.rows[0],
          visitor: { visitorId: 'visitor-one', firstTouch: { channel: 'paid_social' } },
          sessions: [],
          events: [],
          leads: [],
        },
      });
    const data =
      report[name] ||
      (name === 'event-summary' || name === 'events' || name === 'visitors' || name === 'sessions'
        ? []
        : null);
    return Promise.resolve({
      data,
      pagination: { page: options.params?.page || 1, limit: 30, total: 0 },
    });
  });
});
afterEach(() => {
  cleanup();
  mockGet.mockReset();
});

describe('admin analytics dashboard', () => {
  it('renders real overview metrics and changes URL date, filter, comparison and attribution state', async () => {
    renderAt('/admin/analytics?from=2026-09-01&to=2026-09-30');
    expect(screen.getAllByLabelText('Loading analytics').length).toBeGreaterThan(0);
    await screen.findByText('Visitor activation rate');
    expect(screen.getByText('42')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Attribution model'), {
      target: { value: 'firstTouch' },
    });
    expect(screen.getByTestId('location').textContent).toContain('model=firstTouch');
    fireEvent.click(screen.getByLabelText('Compare previous period'));
    expect(screen.getByTestId('location').textContent).toContain('compare=previous');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/admin/analytics/overview', expect.objectContaining({ params: expect.objectContaining({ from: '2026-08-02', to: '2026-08-31' }) })));
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'week' } });
    expect(screen.getByTestId('location').textContent).toContain('period=week');
    fireEvent.click(screen.getByText('Filters'));
    fireEvent.change(screen.getByPlaceholderText('Any source'), { target: { value: 'Meta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByTestId('location').textContent).toContain('source=Meta');
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        '/admin/analytics/overview',
        expect.objectContaining({
          params: expect.objectContaining({ source: 'Meta', model: 'firstTouch' }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Source filter' }));
    expect(screen.getByTestId('location').textContent).not.toContain('source=Meta');
  });

  it('drills from source to campaigns and shows sortable bounded results', async () => {
    renderAt('/admin/analytics/acquisition?dimension=source&from=2026-09-01&to=2026-09-30');
    await screen.findByText('Source performance');
    await screen.findByText('Source quality');
    await waitFor(() => expect(screen.getAllByText('Meta').length).toBeGreaterThan(0));
    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: /Visitors/ }));
    fireEvent.click(within(table).getByRole('button', { name: /Visitors/ }));
    expect(within(table).getAllByRole('row')[1].textContent).toContain('Google');
    fireEvent.click(within(table).getByText('Meta'));
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toContain('/admin/analytics/campaigns'),
    );
    expect(screen.getByTestId('location').textContent).toContain('source=Meta');
  });

  it('renders funnel drop-off math from configured backend steps', async () => {
    renderAt('/admin/analytics/funnel?from=2026-09-01&to=2026-09-30');
    await screen.findByText('Visitor progression');
    await waitFor(() => expect(screen.getByText(/60 drop-off/)).toBeTruthy());
    expect(screen.getByText(/20% of entry/)).toBeTruthy();
  });

  it('switches conversion attribution, paginates and opens a journey', async () => {
    renderAt('/admin/analytics/conversions?from=2026-09-01&to=2026-09-30');
    await waitFor(() => expect(screen.getByText('Paid Social')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Attribution model'), {
      target: { value: 'firstTouch' },
    });
    await waitFor(() => expect(screen.getByText(/Active model: First touch/)).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByTestId('location').textContent).toContain('page=2');
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/admin/analytics/conversions', expect.objectContaining({ params: expect.objectContaining({ page: 2 }) })));
    fireEvent.click(await screen.findByText('Access Activated', { selector: 'td' }));
    await screen.findByRole('dialog', { name: 'Conversion journey' });
    expect(screen.getByText(/Visitor visitor-one/)).toBeTruthy();
  });

  it('isolates API errors and handles empty and malformed responses', async () => {
    mockGet.mockRejectedValue(new Error('Report unavailable'));
    renderAt('/admin/analytics/funnel');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Report unavailable'),
    );
    cleanup();
    mockGet.mockResolvedValue({ data: null });
    renderAt('/admin/analytics/acquisition');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Malformed analytics response'),
    );
    cleanup();
    mockGet.mockResolvedValue({ data: { rows: [] } });
    renderAt('/admin/analytics/acquisition');
    await waitFor(() => expect(screen.getByText(/No channel data for this period/)).toBeTruthy());
  });

  it('keeps wide tables scrollable on narrow layouts', async () => {
    renderAt('/admin/analytics/conversions');
    await screen.findByText('Attribution comparison');
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('table')[0].parentElement.className).toContain('overflow-x-auto');
  });
});
