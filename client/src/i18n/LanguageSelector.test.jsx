import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LanguageSelector } from './LanguageSelector.jsx';
import i18n, { guestLanguage } from './index.js';
import { useTranslation } from 'react-i18next';
import { Modal } from '../components/ui.jsx';

function OpenDialog() {
  const { t } = useTranslation();
  return <Modal open onClose={() => {}} title={t('settings')}><button type="button">{t('save')}</button></Modal>;
}

afterEach(() => { cleanup(); localStorage.removeItem('orbit-guest-language'); vi.unstubAllGlobals(); });

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
  it('updates an already open nested dialog without closing it', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    render(<><LanguageSelector /><OpenDialog /></>);
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'الإعدادات' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'حفظ التغييرات' })).toBeTruthy();
    expect(document.documentElement.dir).toBe('rtl');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy());
    expect(document.documentElement.dir).toBe('ltr');
  });
});
