import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Login from './Login.jsx';
import i18n from '../i18n/index.js';

const login = vi.fn();
vi.mock('../context/useAuth.js', () => ({
  useAuth: () => ({ loading: false, user: null, login }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('universal login', () => {
  it.each(['0550123456', 'legacy@example.com'])(
    'submits %s and preserves the requested destination',
    async (identifier) => {
      login.mockResolvedValue({ access: { eligible: true } });
      render(
        <MemoryRouter initialEntries={['/login?next=%2Fsettings']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/panel/settings" element={<p>Settings ready</p>} />
          </Routes>
        </MemoryRouter>,
      );
      const input = screen.getByLabelText('Email or phone number');
      expect(input.type).toBe('text');
      expect(input.autocomplete).toBe('username');
      fireEvent.change(input, { target: { value: ` ${identifier} ` } });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'long-password-123' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(screen.getByLabelText('Password').type).toBe('text');
      fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
      await waitFor(() => expect(login).toHaveBeenCalledWith(identifier, 'long-password-123'));
      expect(await screen.findByText('Settings ready')).toBeTruthy();
    },
  );
  it('keeps the international identifier readable with Arabic labels', async () => {
    await i18n.changeLanguage('ar');
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('البريد الإلكتروني أو رقم الهاتف').dir).toBe('ltr');
    expect(screen.getByLabelText('كلمة المرور').type).toBe('password');
  });
  it('shows failed login feedback and restores the submit button', async () => {
    login.mockRejectedValue(new Error('Invalid email, phone number or password'));
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Invalid email, phone number or password',
    );
    expect(screen.getByRole('button', { name: 'Sign in' }).disabled).toBe(false);
  });
});
