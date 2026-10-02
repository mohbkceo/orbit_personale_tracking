// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminLayout from './AdminLayout.jsx';

let admin = { fullName: 'Sam Operator', role: 'ADMIN' };
const logout = vi.fn();
vi.mock('../../context/useAuth.js', () => ({ useAdminAuth: () => ({ admin, logout }) }));
afterEach(() => { cleanup(); logout.mockReset(); });

function renderAdmin(path = '/admin') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin" element={<AdminLayout />}><Route index element={<p>Dashboard content</p>} /><Route path="users" element={<p>Users content</p>} /><Route path="settings/automation" element={<p>Automation content</p>} /></Route></Routes></MemoryRouter>);
}

describe('Admin shell', () => {
  it('shows grouped routes while hiding Super Admin destinations from ordinary admins', () => {
    admin = { fullName: 'Sam Operator', role: 'ADMIN' };
    renderAdmin();
    const nav = screen.getByRole('navigation', { name: 'Admin navigation' });
    expect(within(nav).getByRole('link', { name: 'Users' })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Admins' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.getByText('Sam Operator')).toBeTruthy();
  });

  it('opens the mobile drawer and closes it after navigation or Escape', () => {
    admin = { fullName: 'Chief Admin', role: 'SUPER_ADMIN' };
    renderAdmin();
    fireEvent.click(screen.getByRole('button', { name: 'Open admin navigation' }));
    let drawer = screen.getByRole('dialog', { name: 'Admin navigation' });
    expect(within(drawer).getByRole('link', { name: 'Settings' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open admin navigation' }));
    drawer = screen.getByRole('dialog', { name: 'Admin navigation' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'Users' }));
    expect(screen.getByText('Users content')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull();
  });
});
