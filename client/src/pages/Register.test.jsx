import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import Register from './Register.jsx';

const registerDirect = vi.fn();
vi.mock('../context/useAuth.js', () => ({ useAuth: () => ({ loading: false, user: null, access: null, registerDirect }) }));
vi.mock('../analytics/client.js', () => ({ analytics: { track: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('direct registration', () => {
  it('collects only essentials and preserves selected plan through registration', async () => {
    registerDirect.mockResolvedValue({});
    render(<MemoryRouter initialEntries={['/register?next=%2Fcheckout%3Fplan%3Dabc']}><Routes><Route path="/register" element={<Register />} /><Route path="/checkout" element={<p>Checkout ready</p>} /></Routes></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Test Customer' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-password-123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/ }));
    await waitFor(() => expect(registerDirect).toHaveBeenCalledWith({ fullName: 'Test Customer', email: 'test@example.com', password: 'long-password-123' }));
    expect(await screen.findByText('Checkout ready')).toBeTruthy();
  });
  it('shows understandable server validation/duplicate feedback', async () => {
    registerDirect.mockRejectedValue(new Error('An account with this email already exists. Please sign in.'));
    render(<MemoryRouter><Register /></MemoryRouter>);
    fireEvent.submit(screen.getByRole('button', { name: /Create account/ }).closest('form'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'An account with this email already exists. Please sign in.');
  });
});
