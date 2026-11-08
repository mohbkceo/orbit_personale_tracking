import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import App from './App.jsx';

vi.mock('./context/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  AdminAuthProvider: ({ children }) => children,
}));
vi.mock('./context/useAuth.js', () => ({
  useAuth: () => ({ loading: false, user: { _id: 'owner' }, access: { eligible: true } }),
  useAdminAuth: () => ({ loading: false, admin: null }),
}));
vi.mock('./components/PanelShell.jsx', () => ({ default: () => <Outlet /> }));
vi.mock('./components/FeatureGate.jsx', () => ({
  FeatureGate: ({ featureKey, children }) =>
    featureKey === 'wishlist' ? <p>Wrong gate</p> : children,
}));
vi.mock('./analytics/client.js', () => ({ analytics: { start: vi.fn(), page: vi.fn() } }));
vi.mock('./analytics/meta.js', () => ({ meta: { sync: vi.fn(), page: vi.fn() } }));
vi.mock('./analytics/AdvertisingConsent.jsx', () => ({ AdvertisingConsent: () => null }));
vi.mock('./pages/Planning.jsx', () => ({ default: ({ kind }) => <h1>{kind}</h1> }));
function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}
afterEach(cleanup);
describe('legacy Wishlist links', () => {
  for (const path of [
    '/panel/personal/wishlist',
    '/panel/personal/wishlist/old-id',
    '/panel/planning/wishlist',
    '/personal/wishlist',
    '/wishlist',
  ])
    it(`redirects ${path} to Goals`, async () => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
          <Location />
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: 'goals' });
      expect(screen.getByTestId('location').textContent).toBe('/panel/planning/goals');
      expect(screen.queryByText('Wrong gate')).toBeNull();
    });
});
