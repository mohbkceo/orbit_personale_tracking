import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeatureGate } from './FeatureGate.jsx';

let access;
vi.mock('../context/CapabilitiesContext.js', () => ({ useCapabilities: () => access }));
afterEach(() => { cleanup(); });

describe('FeatureGate', () => {
  it('shows an upgrade preview without mounting restricted private content', () => {
    const mounted = vi.fn();
    function PrivateProjects() { mounted(); return <p>Private project name</p>; }
    access = { loading: false, error: null, decision: () => ({ allowed: false, reason: 'PLAN_REQUIRED', presentation: { title: 'Projects', description: 'Organize your work.', ctaLabel: 'Upgrade to Plus', recommendedPlan: { name: 'Plus', slug: 'plus' }, presentation: 'BLUR' } }) };
    render(<MemoryRouter><FeatureGate featureKey="projects"><PrivateProjects /></FeatureGate></MemoryRouter>);
    expect(screen.getByText('Organize your work.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Upgrade to Plus' }).getAttribute('href')).toBe('/pricing?feature=projects&plan=plus');
    expect(screen.queryByText('Private project name')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
  });

  it('shows service unavailability without a misleading upgrade action', () => {
    access = { loading: false, error: null, decision: () => ({ allowed: false, reason: 'FEATURE_DISABLED', presentation: { title: 'Projects', presentation: 'INFORMATION' } }) };
    render(<MemoryRouter><FeatureGate featureKey="projects"><p>Private</p></FeatureGate></MemoryRouter>);
    expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('fails closed when the capabilities request fails', () => {
    access = { loading: false, error: 'Network unavailable', refresh: vi.fn(), decision: () => ({ allowed: true }) };
    render(<MemoryRouter><FeatureGate featureKey="projects"><p>Private</p></FeatureGate></MemoryRouter>);
    expect(screen.getByText('Access check unavailable')).toBeTruthy();
    expect(screen.queryByText('Private')).toBeNull();
  });
});
