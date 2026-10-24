// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminUserDetail } from './UserDetail.jsx';
import SupportWorkspace from './SupportWorkspace.jsx';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../api/client.js', () => ({
  api: { get: (...args) => get(...args), post: (...args) => post(...args) },
}));
vi.mock('../../context/useAuth.js', () => ({
  useAdminAuth: () => ({ admin: { role: 'SUPER_ADMIN' } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const detail = {
  user: {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    fullName: 'Taylor Doe',
    email: 'taylor@example.com',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  access: null,
  telegram: null,
  history: [],
  metrics: { tasks: 2, transactions: 0, reminders: 0 },
};
function mockReads() {
  get.mockImplementation((path) => {
    if (path.endsWith('/management'))
      return Promise.resolve({ data: { sessions: [], events: [], notes: [], overrides: [] } });
    if (path === '/admin/support/session')
      return Promise.resolve({
        data: { user: detail.user, expiresAt: new Date(Date.now() + 600000).toISOString() },
      });
    if (path.includes('/admin/support/workspace/'))
      return Promise.resolve({ data: { data: { counts: { tasks: 2 }, plan: { name: 'Free' } } } });
    return Promise.resolve({ data: detail });
  });
}
function renderRoutes(path = '/admin/users/aaaaaaaaaaaaaaaaaaaaaaaa') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/users/:id" element={<AdminUserDetail />} />
        <Route path="/admin/users/:id/inside" element={<SupportWorkspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('user administration interface', () => {
  it('has exactly three main tabs and required actions with responsive tab navigation', async () => {
    mockReads();
    renderRoutes();
    expect(await screen.findByRole('heading', { name: 'Taylor Doe' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Activity',
      'Security',
    ]);
    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Go Inside/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Security' }));
    expect(screen.getByText('Login sessions and revocation')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Activation and grant history')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Activity' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Security' }).getAttribute('aria-selected')).toBe('true');
  });

  it('requires reason, admin password and confirmation before entering, then exits', async () => {
    mockReads();
    post.mockResolvedValue({ data: { exited: true } });
    renderRoutes();
    fireEvent.click(await screen.findByRole('button', { name: /Go Inside/ }));
    const dialog = screen.getByRole('dialog', { name: /Go Inside/ });
    const enter = within(dialog).getByRole('button', { name: 'Enter read-only workspace' });
    expect(enter.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Support reason'), {
      target: { value: 'Investigating a reported workspace issue' },
    });
    fireEvent.change(within(dialog).getByLabelText('Confirm admin password'), {
      target: { value: 'secret-admin-password' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(enter);
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/admin/support/sessions',
        expect.objectContaining({
          confirmed: true,
          reason: 'Investigating a reported workspace issue',
        }),
      ),
    );
    expect(
      await screen.findByText(/Admin Support Mode · Viewing Taylor Doe · Read-only/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exit to Admin' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/support/exit'));
    expect(await screen.findByRole('button', { name: /Go Inside/ })).toBeTruthy();
  });
});
