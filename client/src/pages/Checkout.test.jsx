import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import Checkout from './Checkout.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), refresh: vi.fn(), event: vi.fn(), user: { id: 'user1' } }));
vi.mock('../api/client.js', () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock('../context/useAuth.js', () => ({ useAuth: () => ({ loading: false, user: mocks.user, refresh: mocks.refresh }) }));
vi.mock('../analytics/meta.js', () => ({ meta: { event: mocks.event } }));
vi.mock('../analytics/client.js', () => ({ analytics: { session: vi.fn() } }));
vi.mock('../marketing/GetStartedModal.jsx', () => ({ GetStartedModal: () => null }));
const plan = { name: 'Orbit month', durationValue: 1, durationUnit: 'MONTH', features: [{ key: 'tasks', name: 'Tasks', type: 'LIMIT', limit: 50 }] };
const order = { id: 'order1', plan, state: 'PROCESSING', invoiceId: '123', amount: 2500, currency: 'DZD' };
beforeEach(() => {
  mocks.get.mockImplementation(async (path) => ({ data: path === '/public/config' ? { payments: { enabled: true } } : order }));
  mocks.post.mockResolvedValue({ data: order });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('checkout return and recovery', () => {
  it('does not trust success query parameters and stays pending until verification', async () => {
    render(<MemoryRouter initialEntries={['/checkout/return?order=order1&success=true']}><Checkout /></MemoryRouter>);
    expect(await screen.findByText('Payment awaiting confirmation')).toBeTruthy();
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/payments/orders/order1/verify', {}));
    expect(screen.queryByText('Payment verified. Your subscription is ready.')).toBeNull();
    expect(mocks.event).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resume secure payment' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/payments/orders/order1/pay', {}));
  });
  it('shows success and reports the exact server conversion only on verified PAID', async () => {
    const conversion = { name: 'Purchase', eventId: 'purchase:order1', data: { currency: 'DZD', value: 2500 } };
    mocks.post.mockResolvedValue({ data: { ...order, state: 'PAID', conversion } });
    render(<MemoryRouter initialEntries={['/checkout/return?order=order1']}><Checkout /></MemoryRouter>);
    expect(await screen.findByText('Payment verified. Your subscription is ready.')).toBeTruthy();
    expect(mocks.event).toHaveBeenCalledWith(conversion); expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Continue to Orbit' }).getAttribute('href')).toBe('/onboarding');
  });
  it('leaves a recoverable pending order on verification failure', async () => {
    mocks.post.mockRejectedValue(new Error('Could not verify payment. Check again.'));
    render(<MemoryRouter initialEntries={['/checkout/return?order=order1']}><Checkout /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not verify payment. Check again.');
    expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
    expect(mocks.event).not.toHaveBeenCalled();
  });
  it('reports an already confirmed order returned by background reconciliation once', async () => {
    const conversion = { name: 'Purchase', eventId: 'purchase:order1' };
    mocks.get.mockImplementation(async (path) => ({ data: path === '/public/config' ? { payments: { enabled: true } } : { ...order, state: 'PAID', conversion } }));
    render(<MemoryRouter initialEntries={['/checkout/return?order=order1']}><Checkout /></MemoryRouter>);
    expect(await screen.findByText('Payment verified. Your subscription is ready.')).toBeTruthy();
    await waitFor(() => expect(mocks.event).toHaveBeenCalledExactlyOnceWith(conversion));
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it('allows cancelling an unsent pending order', async () => {
    mocks.get.mockImplementation(async (path) => ({ data: path === '/public/config' ? { payments: { enabled: false } } : { ...order, state: 'PENDING', invoiceId: null } }));
    mocks.post.mockResolvedValue({ data: { ...order, state: 'CANCELLED' } });
    render(<MemoryRouter initialEntries={['/checkout?order=order1']}><Checkout /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel unpaid order' }));
    expect(await screen.findByText('This order is cancelled. No access was granted by this order.')).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledExactlyOnceWith('/payments/orders/order1/cancel', {});
  });
});
