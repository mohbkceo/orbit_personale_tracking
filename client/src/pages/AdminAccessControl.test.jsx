import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminAccessControl from './AdminAccessControl.jsx';

const get = vi.fn();
const patch = vi.fn();
vi.mock('../api/client.js', () => ({ api: { get: (...args) => get(...args), patch: (...args) => patch(...args) } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Admin Access Control bulk assignment', () => {
  it('submits selected sections and configured limits for one paid plan', async () => {
    const data = {
      features: [
        { _id: '000000000000000000000001', key: 'goals', name: 'Goals', category: 'Planning', scope: 'SECTION', type: 'BOOLEAN', accessMode: 'FREE' },
        { _id: '000000000000000000000002', key: 'projects-limit', name: 'Maximum projects', category: 'Limits', scope: 'CAPABILITY', type: 'LIMIT', accessMode: 'FREE' },
      ],
      plans: [
        { _id: '000000000000000000000003', name: 'Free', slug: 'free', kind: 'FREE', status: 'ACTIVE', features: [] },
        { _id: '000000000000000000000004', name: 'Plus', slug: 'plus', kind: 'PAID', status: 'ACTIVE', features: [] },
      ],
    };
    get.mockResolvedValue({ data });
    patch.mockResolvedValue({ data: { updated: 2 } });
    render(<AdminAccessControl />);
    fireEvent.click(await screen.findByLabelText('Select Goals'));
    fireEvent.click(screen.getByLabelText('Select Maximum projects'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText(/Only this plan/));
    fireEvent.click(screen.getByRole('button', { name: 'Grant 2 for Plus' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/admin/access-control/bulk', {
      planId: '000000000000000000000004', operation: 'GRANT', exclusive: true, applyExisting: false,
      features: [{ key: 'goals' }, { key: 'projects-limit', limit: 2 }],
    }));
    expect(await screen.findByText('2 access rules updated for Plus.')).toBeTruthy();
  });
});
