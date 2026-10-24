import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { OnboardingExperience } from './OnboardingExperience.jsx';

const telegram = vi.hoisted(() => ({ status: { connected: false, botUrl: 'https://t.me/orbit_bot' }, loading: false, busy: false, error: '', connect: vi.fn(), setWatching: vi.fn() }));
vi.mock('../../context/TelegramContext.js', () => ({ useTelegram: () => telegram }));
beforeEach(async () => { await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount(step = 'welcome', status = 'IN_PROGRESS') {
  const update = vi.fn().mockResolvedValue({ status });
  const onExit = vi.fn();
  render(<OnboardingExperience state={{ status, step }} update={update} onExit={onExit} />);
  return { update, onExit };
}

describe('three-step onboarding', () => {
  it.each(['welcome', 'first-action', 'telegram'])('Skip at %s saves SKIPPED and exits', async (step) => {
    const { update, onExit } = mount(step, step === 'welcome' ? 'NOT_STARTED' : 'IN_PROGRESS');
    const skip = screen.getByRole('button', { name: 'Skip' });
    expect(skip.className).toContain('min-h-12');
    fireEvent.click(skip);
    await waitFor(() => expect(update).toHaveBeenCalledWith('SKIPPED', undefined, false));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it.each([['welcome', 'first-action'], ['first-action', 'telegram']])('Next at %s saves %s', async (step, next) => {
    const { update, onExit } = mount(step);
    const button = screen.getByRole('button', { name: /Next/ });
    expect(button.className).toContain('min-h-12');
    fireEvent.click(button);
    await waitFor(() => expect(update).toHaveBeenCalledWith('IN_PROGRESS', next, false));
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: next === 'telegram' ? 'Telegram is optional' : 'See everything together' })).toBeTruthy();
    if (next === 'first-action') {
      for (const benefit of ['Plan tasks', 'Track money', 'Reach goals', 'Stay on schedule']) expect(screen.getByText(benefit)).toBeTruthy();
    }
  });

  it('Next on the final step saves COMPLETED and exits', async () => {
    const { update, onExit } = mount('telegram');
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('COMPLETED', undefined, false));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('keeps Skip available after a save error and prevents duplicate requests', async () => {
    let reject;
    const { update, onExit } = mount();
    update.mockImplementation(() => new Promise((_resolve, failure) => { reject = failure; }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByRole('button', { name: 'Skip' }).disabled).toBe(true);
    reject(new Error('Try again'));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Try again'));
    expect(onExit).not.toHaveBeenCalled();
    update.mockResolvedValue({ status: 'SKIPPED' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(onExit).toHaveBeenCalledOnce());
  });
});
