// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminUsers } from '../Admin.jsx';
import { DeleteUserDialog } from './DeleteUserDialog.jsx';

const get = vi.fn();
const post = vi.fn();
const remove = vi.fn();
vi.mock('../../api/client.js', () => ({
  api: {
    get: (...args) => get(...args),
    post: (...args) => post(...args),
    delete: (...args) => remove(...args),
  },
}));
vi.mock('../../context/useAuth.js', () => ({
  useAdminAuth: () => ({ admin: { role: 'SUPER_ADMIN' } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const rows = [
  { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', fullName: 'Taylor Doe', email: 'taylor@example.com', accessStatus: 'FREE' },
  { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', fullName: 'Sam Lee', email: 'sam@example.com', accessStatus: 'ACTIVE' },
];

describe('user deletion and bulk selection', () => {
  it('selects visible users and applies a confirmed bulk action', async () => {
    get.mockResolvedValue({ data: rows, pagination: { total: 2, pages: 1 } });
    post.mockResolvedValue({ data: { results: rows.map((user) => ({ id: user._id, changed: true })) } });
    render(<MemoryRouter><AdminUsers /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select all users on this page' }));
    expect(screen.getByText('2 selected on this page')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply action' }));
    const dialog = screen.getByRole('dialog', { name: 'Bulk actions · 2 users' });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Security review of both accounts' } });
    fireEvent.change(within(dialog).getByLabelText('Confirm admin password'), { target: { value: 'admin-password' } });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend selected users' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/users/bulk', expect.objectContaining({
      ids: rows.map((user) => user._id), action: 'SUSPEND',
    })));
    expect(await within(dialog).findByText(/Action completed for 2 users/)).toBeTruthy();
  });

  it('requires exact email confirmation before deleting one user', async () => {
    remove.mockResolvedValue({ data: { deleted: true } });
    render(
      <MemoryRouter initialEntries={['/admin/users/aaaaaaaaaaaaaaaaaaaaaaaa']}>
        <Routes>
          <Route path="/admin/users/:id" element={<DeleteUserDialog user={{ id: rows[0]._id, fullName: rows[0].fullName, email: rows[0].email }} onClose={vi.fn()} />} />
          <Route path="/admin/users" element={<p>User list ready</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Delete Taylor Doe' });
    const submit = within(dialog).getByRole('button', { name: 'Permanently delete user' });
    expect(submit.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Type taylor@example.com to confirm'), { target: { value: 'taylor@example.com' } });
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'User requested account removal' } });
    fireEvent.change(within(dialog).getByLabelText('Confirm admin password'), { target: { value: 'admin-password' } });
    fireEvent.click(submit);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('/admin/users/aaaaaaaaaaaaaaaaaaaaaaaa', expect.objectContaining({ data: expect.objectContaining({ confirmationEmail: 'taylor@example.com' }) })));
    expect(await screen.findByText('User list ready')).toBeTruthy();
  });
});
