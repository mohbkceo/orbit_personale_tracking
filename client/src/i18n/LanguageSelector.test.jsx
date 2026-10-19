import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LanguageSelector } from './LanguageSelector.jsx';
import i18n, { guestLanguage } from './index.js';

afterEach(() => { cleanup(); localStorage.removeItem('orbit-guest-language'); });

describe('guest language selection', () => {
  it('switches immediately, persists the guest choice and restores direction', async () => {
    render(<LanguageSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('ar'));
    expect(guestLanguage()).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en'));
    expect(document.documentElement.dir).toBe('ltr');
  });
});
