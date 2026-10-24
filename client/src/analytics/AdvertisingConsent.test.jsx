import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n/index.js';
import { AdvertisingConsent } from './AdvertisingConsent.jsx';

const consent = vi.hoisted(() => ({ value: null, setConsent: vi.fn() }));
vi.mock('./meta.js', () => ({ meta: { choice: () => consent.value, setConsent: (...args) => consent.setConsent(...args) } }));
vi.mock('./AnalyticsConsent.jsx', () => ({ AnalyticsConsent: () => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); consent.value = null; localStorage.removeItem('orbit-privacy-prompt-seen'); });

describe('first-visit privacy prompt', () => {
  it('shows once, saves the choice and leaves no floating Privacy choices button', async () => {
    await i18n.changeLanguage('en');
    consent.setConsent.mockImplementation(async (granted) => { consent.value = granted ? 'granted' : 'denied'; });
    render(<MemoryRouter><AdvertisingConsent /></MemoryRouter>);
    expect(screen.getByLabelText('Your advertising privacy')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Decline / withdraw' }));
    await waitFor(() => expect(screen.queryByLabelText('Your advertising privacy')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Privacy choices' })).toBeNull();
    cleanup();
    render(<MemoryRouter><AdvertisingConsent /></MemoryRouter>);
    expect(screen.queryByLabelText('Your advertising privacy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Privacy choices' })).toBeNull();
  });

  it('does not show the prompt for a returning visitor with a saved choice', async () => {
    await i18n.changeLanguage('en');
    consent.value = 'granted';
    render(<MemoryRouter><AdvertisingConsent /></MemoryRouter>);
    expect(screen.queryByLabelText('Your advertising privacy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Privacy choices' })).toBeNull();
  });

  it('does not reopen after its first appearance even if no choice was made', async () => {
    await i18n.changeLanguage('en');
    render(<MemoryRouter><AdvertisingConsent /></MemoryRouter>);
    expect(screen.getByLabelText('Your advertising privacy')).toBeTruthy();
    await waitFor(() => expect(localStorage.getItem('orbit-privacy-prompt-seen')).toBe('1'));
    cleanup();
    render(<MemoryRouter><AdvertisingConsent /></MemoryRouter>);
    expect(screen.queryByLabelText('Your advertising privacy')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Privacy choices' })).toBeNull();
  });
});
