// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SubscriptionDialog } from './SubscriptionDialog.jsx';

const get = vi.fn();
const post = vi.fn();
vi.mock('../../api/client.js', () => ({
  api: { get: (...args) => get(...args), post: (...args) => post(...args) },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('manual subscription dialog', () => {
  it('reuses the grant idempotency key when a network failure is retried', async () => {
    get.mockImplementation((path) =>
      Promise.resolve({
        data:
          path === '/admin/plans'
            ? [{ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Plus', kind: 'PAID', status: 'ACTIVE' }]
            : { features: [] },
      }),
    );
    post.mockRejectedValueOnce(new Error('Network unavailable'));
    post.mockResolvedValueOnce({ data: { id: 'grant-id' } });
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(
      <SubscriptionDialog
        id="bbbbbbbbbbbbbbbbbbbbbbbb"
        data={{ history: [], purchases: [] }}
        management={{ overrides: [] }}
        onClose={vi.fn()}
        onChanged={onChanged}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Paid plan'), {
      target: { value: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
    });
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'Confirmed support request' },
    });
    fireEvent.change(screen.getByLabelText('Confirm admin password'), {
      target: { value: 'secure-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply access' }));
    expect(await screen.findByText('Network unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply access' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0][1].idempotencyKey).toBe(post.mock.calls[1][1].idempotencyKey);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });
});
