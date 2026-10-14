import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramProvider } from './TelegramProvider.jsx';
import { useTelegram } from './TelegramContext.js';

const get = vi.fn();
const post = vi.fn();
vi.mock('../api/client.js', () => ({ api: { get: (...args) => get(...args), post: (...args) => post(...args) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function Probe() {
  const telegram = useTelegram();
  return <><p>{telegram.status?.connected ? 'Telegram Linked' : 'Not connected'}</p>
    <button onClick={() => telegram.setOpen(true)}>Open</button>
    <button onClick={telegram.connect}>Connect</button>
    <button onClick={telegram.refresh}>Refresh</button></>;
}

describe('TelegramProvider', () => {
  it('shares status and updates it after the bot link is confirmed', async () => {
    get.mockResolvedValueOnce({ data: { connected: false } }).mockResolvedValueOnce({ data: { connected: true, telegramUsername: 'orbituser' } });
    post.mockResolvedValue({ data: { url: 'https://t.me/orbit_test_bot?start=token', expiresAt: new Date(Date.now() + 60000).toISOString() } });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<TelegramProvider><Probe /></TelegramProvider>);
    expect(await screen.findByText('Not connected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/telegram-link'));
    expect(open).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Telegram Linked')).toBeTruthy();
    open.mockRestore();
  });
});
