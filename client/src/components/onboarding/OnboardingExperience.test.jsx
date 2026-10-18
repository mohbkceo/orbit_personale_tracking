import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingExperience } from './OnboardingExperience.jsx';

const mocks = vi.hoisted(() => ({ create: vi.fn(), connect: vi.fn(), refresh: vi.fn(), telegram: { status: { connected: false, botUrl: 'https://t.me/orbit_test_bot' }, loading: false, link: null, busy: false, error: '' }, capabilities: { tasks: { allowed: true }, accounts: { allowed: true }, 'active-tasks-limit': { allowed: true, remaining: 5 }, 'accounts-limit': { allowed: true, remaining: 3 }, 'telegram-assistant': { allowed: true } } }));
vi.mock('../../api/client.js', () => ({ endpoints: { create: (...args) => mocks.create(...args) } }));
vi.mock('../../context/useApp.js', () => ({ useApp: () => ({ settings: { defaultCurrency: 'NGN' } }) }));
vi.mock('../../context/CapabilitiesContext.js', () => ({ useCapabilities: () => ({ loading: false, decision: (key) => mocks.capabilities[key], refresh: vi.fn() }) }));
vi.mock('../../context/TelegramContext.js', () => ({ useTelegram: () => ({ ...mocks.telegram, connect: mocks.connect, refresh: mocks.refresh }) }));

const initial = { status: 'NOT_STARTED', step: 'welcome', actions: { task: false, account: false } };
function mount(state = initial) {
  const update = vi.fn().mockResolvedValue({ status: 'IN_PROGRESS' });
  const onExit = vi.fn();
  render(<MemoryRouter><OnboardingExperience state={state} update={update} onExit={onExit} /></MemoryRouter>);
  return { update, onExit };
}
beforeEach(() => { mocks.create.mockResolvedValue({ data: { _id: 'created' } }); mocks.telegram = { status: { connected: false, botUrl: 'https://t.me/orbit_test_bot' }, loading: false, link: null, busy: false, error: '' }; mocks.capabilities.tasks = { allowed: true }; mocks.capabilities.accounts = { allowed: true }; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('optional first use experience', () => {
  it('offers immediate skip and keeps the dashboard exit available by Escape', async () => {
    const { update, onExit } = mount();
    expect(screen.getByRole('heading', { name: 'Welcome to Orbit!' })).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(update).toHaveBeenCalledWith('SKIPPED'));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('creates a real task through the shared resource API and shows success', async () => {
    const { update } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Let's Get Started/ }));
    expect(await screen.findByRole('heading', { name: /something simple/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Create my first task/ }));
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Plan the week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('tasks', { title: 'Plan the week', priority: 'medium' }));
    expect(await screen.findByText(/Your first task is in Orbit/)).toBeTruthy();
    expect(update).toHaveBeenCalledWith('IN_PROGRESS', 'first-action');
  });

  it('creates a wallet with the user currency and existing account API', async () => {
    mount({ ...initial, status: 'IN_PROGRESS', step: 'first-action' });
    fireEvent.click(screen.getByRole('button', { name: /Set up my wallet/ }));
    fireEvent.change(screen.getByLabelText('Wallet or account name'), { target: { value: 'Daily spending' } });
    fireEvent.change(screen.getByLabelText('Opening balance (optional)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save wallet' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('accounts', { name: 'Daily spending', type: 'bank', currency: 'NGN', openingBalance: 50 }));
    expect(await screen.findByText(/Your first wallet is in Orbit/)).toBeTruthy();
  });

  it('hides unavailable actions and lets the user continue without an upgrade', async () => {
    mocks.capabilities.tasks = { allowed: false }; mocks.capabilities.accounts = { allowed: false };
    const { update } = mount({ ...initial, status: 'IN_PROGRESS', step: 'first-action' });
    expect(screen.queryByRole('button', { name: /Create my first task/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Set up my wallet/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('IN_PROGRESS', 'telegram'));
  });

  it('uses the shared Telegram provider, permits skipping, and recognizes linked users', async () => {
    const { update } = mount({ ...initial, status: 'IN_PROGRESS', step: 'telegram' });
    fireEvent.click(screen.getByRole('button', { name: 'Connect Telegram' }));
    expect(mocks.connect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: "I'll do this later" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('IN_PROGRESS', 'finish'));
    cleanup();
    mocks.telegram = { ...mocks.telegram, status: { connected: true, telegramUsername: 'orbituser', botUrl: 'https://t.me/orbit_test_bot' } };
    mount({ ...initial, status: 'IN_PROGRESS', step: 'telegram' });
    expect(screen.getByText(/Telegram connected as @orbituser/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open the bot/ }).getAttribute('href')).toBe('https://t.me/orbit_test_bot');
  });

  it('persists completion without requiring either optional action', async () => {
    const { update, onExit } = mount({ ...initial, status: 'IN_PROGRESS', step: 'finish' });
    expect(screen.getByText('Account created')).toBeTruthy();
    expect(screen.queryByText('First task created')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Go to my Dashboard/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('COMPLETED'));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
