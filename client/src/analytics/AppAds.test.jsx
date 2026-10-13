import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';

const measurement = vi.hoisted(() => ({ sync: vi.fn(), page: vi.fn() }));
vi.mock('./meta.js', () => ({ meta: measurement }));
vi.mock('./client.js', () => ({ analytics: { start: vi.fn(), page: vi.fn() } }));
vi.mock('./AdvertisingConsent.jsx', () => ({ AdvertisingConsent: () => null }));
vi.mock('../marketing/MarketingLayout.jsx', async () => { const { Outlet } = await import('react-router-dom'); return { MarketingLayout: () => <Outlet /> }; });
vi.mock('../marketing/Landing.jsx', async () => { const { Link } = await import('react-router-dom'); return { default: () => <Link to="/pricing">Choose plan</Link> }; });
vi.mock('../pages/Pricing.jsx', () => ({ default: () => <h1>Pricing page</h1> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('connects advertising tracking to public landing and SPA navigation', async () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Choose plan'));
  expect(await screen.findByText('Pricing page')).toBeTruthy();
  expect(measurement.sync).toHaveBeenCalledOnce();
  await waitFor(() => expect(measurement.page).toHaveBeenCalledTimes(2));
});
