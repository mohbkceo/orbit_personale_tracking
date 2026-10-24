import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingGate } from './OnboardingGate.jsx';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('../../api/client.js', () => ({ api: { get: (...args) => mocks.get(...args), patch: (...args) => mocks.patch(...args) } }));
vi.mock('./OnboardingExperience.jsx', () => ({ OnboardingExperience: ({ onExit, update }) => <div><button onClick={async () => { await update('SKIPPED'); onExit(); }}>Skip</button><button onClick={async () => { await update('COMPLETED'); onExit(); }}>Complete</button></div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function mount() { render(<MemoryRouter initialEntries={['/onboarding']}><Routes><Route path="/onboarding" element={<OnboardingGate />} /><Route path="/subscribe" element={<p>Choose plan ready</p>} /></Routes></MemoryRouter>); }

describe('standalone onboarding route', () => {
  it.each([['Skip', 'SKIPPED'], ['Complete', 'COMPLETED']])('%s persists and navigates to plans', async (label, status) => {
    mocks.get.mockResolvedValue({ data: { status: 'NOT_STARTED', step: 'welcome' } });
    mocks.patch.mockResolvedValue({ data: { status } });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: label }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/me/onboarding', { status }));
    expect(await screen.findByText('Choose plan ready')).toBeTruthy();
  });
});
