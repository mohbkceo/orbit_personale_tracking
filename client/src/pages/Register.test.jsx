import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import Register from './Register.jsx';

const auth = vi.hoisted(() => ({ user: null, setUser: null, registerDirect: vi.fn() }));
vi.mock('../context/useAuth.js', async () => {
  const { useEffect, useState } = await import('react');
  return { useAuth: () => {
    const [user, setUser] = useState(auth.user);
    useEffect(() => { auth.setUser = setUser; }, []);
    return { loading: false, user, access: null, registerDirect: auth.registerDirect };
  } };
});
vi.mock('../analytics/client.js', () => ({ analytics: { track: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.user = null; auth.setUser = null; });
describe('direct registration', () => {
  it('collects only essentials and enters onboarding after registration', async () => {
    auth.registerDirect.mockResolvedValue({});
    render(<MemoryRouter initialEntries={['/register?next=%2Fcheckout%3Fplan%3Dabc']}><Routes><Route path="/register" element={<Register />} /><Route path="/onboarding" element={<p>Onboarding ready</p>} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    await waitFor(() => expect(auth.registerDirect).toHaveBeenCalledWith({ fullName: 'Test Customer', email: 'test@example.com', password: 'long-password-123' }));
    expect(await screen.findByText('Onboarding ready')).toBeTruthy();
    expect(sessionStorage.getItem('orbit:registration-next')).toBe('/checkout?plan=abc');
  });
  it('does not let the auth state update redirect a newly registered user to the dashboard', async () => {
    auth.registerDirect.mockImplementation(async () => {
      auth.setUser({ id: 'new-user' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {};
    });
    render(<MemoryRouter initialEntries={['/register']}><Routes><Route path="/register" element={<Register />} /><Route path="/onboarding" element={<p>Onboarding ready</p>} /><Route path="/panel" element={<p>Dashboard ready</p>} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByText('Onboarding ready')).toBeTruthy();
    expect(screen.queryByText('Dashboard ready')).toBeNull();
  });
  it('shows understandable server validation/duplicate feedback', async () => {
    auth.registerDirect.mockRejectedValue(new Error('An account with this email already exists. Please sign in.'));
    render(<MemoryRouter><Register /></MemoryRouter>);
    fireEvent.submit(screen.getByRole('button', { name: /Create account/ }).closest('form'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'An account with this email already exists. Please sign in.');
  });
});
