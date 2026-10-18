import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingGate } from './OnboardingGate.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../api/client.js', () => ({ api: { get: (...args) => mocks.get(...args), patch: (...args) => mocks.patch(...args) } }));
vi.mock('../../context/useApp.js', () => ({ useApp: () => ({ toast: vi.fn() }) }));
vi.mock('./OnboardingExperience.jsx', () => ({ OnboardingExperience: ({ onExit, update }) => <div role="dialog"><h1>Guided setup</h1><button onClick={async () => { await update('SKIPPED'); onExit(); }}>Skip for now</button></div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount(path = '/panel') { render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/panel" element={<><p>Dashboard ready</p><OnboardingGate /></>} /></Routes></MemoryRouter>); }

describe('onboarding presentation', () => {
  it('appears for an eligible new registration and skip immediately reveals the dashboard', async () => {
    mocks.get.mockResolvedValue({ data: { status: 'NOT_STARTED', step: 'welcome', autoPresent: true, actions: {} } });
    mocks.patch.mockResolvedValue({ data: { status: 'SKIPPED', autoPresent: false } });
    mount();
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('Dashboard ready')).toBeTruthy();
    expect(mocks.patch).toHaveBeenCalledWith('/me/onboarding', { status: 'SKIPPED' });
  });

  it('does not interrupt skipped or legacy accounts but opens on manual request', async () => {
    mocks.get.mockResolvedValue({ data: { status: 'SKIPPED', step: 'welcome', autoPresent: false, actions: {} } });
    mount();
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    mount('/panel?onboarding=1');
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith('/me/onboarding', { params: { details: '1' } });
  });
});
