import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Activation from './Activation.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), register: vi.fn(), user: null }));
vi.mock('../api/client.js', () => ({ api: { get: mocks.get } }));
vi.mock('../context/useAuth.js', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, register: mocks.register, refresh: vi.fn() }),
}));
vi.mock('../analytics/client.js', () => ({ analytics: { track: vi.fn() } }));
vi.mock('../appearance/AppearancePicker.jsx', () => ({
  AppearancePicker: () => <p>Choose a style</p>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.user = null;
});

describe('activation signup', () => {
  it('collects phone without email and submits all onboarding preferences', async () => {
    mocks.get.mockResolvedValue({
      data: { plan: { name: 'Month', durationValue: 1, durationUnit: 'MONTH' } },
    });
    mocks.register.mockResolvedValue({});
    render(
      <MemoryRouter initialEntries={['/activate/key']}>
        <Routes>
          <Route path="/activate/:key" element={<Activation />} />
        </Routes>
      </MemoryRouter>,
    );
    const name = await screen.findByLabelText('Full name');
    expect(screen.queryByLabelText('Email')).toBeNull();
    const phone = screen.getByLabelText('Phone number');
    expect(phone.dir).toBe('ltr');
    expect(screen.getByText(/Algeria \(\+213\)/)).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Phone Member' } });
    fireEvent.change(phone, { target: { value: '0550123456' } });
    fireEvent.change(screen.getByLabelText('Password (12+ characters)'), {
      target: { value: 'a-long-secure-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByLabelText('Male', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create account and continue' }));
    await waitFor(() =>
      expect(mocks.register).toHaveBeenCalledWith(
        'key',
        expect.objectContaining({
          fullName: 'Phone Member',
          phone: '0550123456',
          gender: 'MALE',
          preferences: expect.objectContaining({ defaultCurrency: 'DZD' }),
        }),
      ),
    );
    expect(mocks.register.mock.calls[0][1]).not.toHaveProperty('email');
  });
  it('displays the phone identity for an existing signed-in account', async () => {
    mocks.user = { phone: '+213550123456', fullName: 'Phone Member' };
    mocks.get.mockImplementation(async (path) => ({
      data:
        path === '/telegram-link'
          ? { connected: false }
          : { plan: { name: 'Month', durationValue: 1, durationUnit: 'MONTH' } },
    }));
    render(
      <MemoryRouter initialEntries={['/activate/key']}>
        <Routes>
          <Route path="/activate/:key" element={<Activation />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('+213550123456')).toBeTruthy();
    expect(screen.queryByText('undefined')).toBeNull();
  });
});
