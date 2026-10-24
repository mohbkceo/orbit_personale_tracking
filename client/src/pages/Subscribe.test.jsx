import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/index.js';
import Subscribe from './Subscribe.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../api/client.js', () => ({ api: { get: (...args) => mocks.get(...args), patch: (...args) => mocks.patch(...args) } }));
vi.mock('../context/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'user1', email: 'buyer@example.com' }, access: { eligible: true, planType: 'FREE' }, loading: false }) }));

const free = { id: 'free', name: 'Free', slug: 'free', kind: 'FREE', price: { amount: 0, currency: 'DZD' }, features: [] };
const plus = { id: 'plus', name: 'Plus', slug: 'plus', kind: 'PAID', price: { amount: 1000, currency: 'DZD' }, durationValue: 1, durationUnit: 'MONTH', features: [] };
beforeEach(async () => {
  await i18n.changeLanguage('en');
  sessionStorage.clear();
  mocks.get.mockImplementation(async (path) => ({ data: path === '/public/plans' ? [free, plus] : { payments: { enabled: true }, sales: { ccpInstructions: 'CCP 12345', whatsappNumber: '213555123456', whatsappMessage: 'Orbit sales' } } }));
  mocks.patch.mockResolvedValue({ data: { status: 'SKIPPED' } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount() { render(<MemoryRouter initialEntries={['/subscribe']}><Routes><Route path="/subscribe" element={<Subscribe />} /><Route path="/panel" element={<p>Dashboard ready</p>} /><Route path="/checkout" element={<p>Checkout ready</p>} /></Routes></MemoryRouter>); }

describe('optional plan selection', () => {
  it('Skip for now persists choice and goes directly to Free dashboard', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/me/plan-selection', { status: 'SKIPPED' }));
    expect(await screen.findByText('Dashboard ready')).toBeTruthy();
  });

  it('offers a paid plan with CCP, WhatsApp and Slickpay without activating it', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose plan' }));
    expect(screen.queryByText('CCP 12345')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pay by CCP' }));
    expect(screen.getByText('CCP 12345')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pay securely with Slickpay/ }).getAttribute('href')).toBe('/checkout?plan=plus');
    const contact = screen.getByRole('link', { name: /Contact Team on WhatsApp/ });
    const url = new URL(contact.getAttribute('href'));
    expect(url.hostname).toBe('wa.me');
    expect(url.pathname).toBe('/213555123456');
    expect(url.searchParams.get('text')).toBe('Orbit sales\nAccount email: buyer@example.com');
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('disables CCP and Slickpay when their configuration is unavailable', async () => {
    mocks.get.mockImplementation(async (path) => ({ data: path === '/public/plans' ? [free, plus] : { payments: { enabled: false }, sales: { ccpInstructions: '  ', whatsappNumber: '213555123456', whatsappMessage: 'Orbit sales' } } }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose plan' }));
    expect(screen.getByRole('button', { name: 'Pay by CCP' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Pay securely with Slickpay' }).disabled).toBe(true);
    expect(screen.queryByText('CCP 12345')).toBeNull();
    expect(screen.getByRole('link', { name: /Contact Team on WhatsApp/ })).toBeTruthy();
  });

  it('localizes the account email line in the WhatsApp message', async () => {
    await i18n.changeLanguage('ar');
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'اختر الخطة' }));
    const url = new URL(screen.getByRole('link', { name: /واتساب/ }).getAttribute('href'));
    expect(url.searchParams.get('text')).toBe('Orbit sales\nالبريد الإلكتروني للحساب: buyer@example.com');
  });

  it('keeps Skip accessible when plan loading fails', async () => {
    mocks.get.mockRejectedValue(new Error('Offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Offline');
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('Dashboard ready')).toBeTruthy();
  });

  it('preselects a safe checkout deep link after onboarding', async () => {
    sessionStorage.setItem('orbit:registration-next', '/checkout?plan=plus');
    mount();
    expect(await screen.findByText('Pay for Plus')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose plan' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps an activation deep link available after onboarding', async () => {
    sessionStorage.setItem('orbit:registration-next', '/activate/valid-key');
    mount();
    expect((await screen.findByRole('link', { name: 'Redeem activation link' })).getAttribute('href')).toBe('/activate/valid-key');
  });
});
