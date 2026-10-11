// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminQrBatches } from './QrBatches.jsx';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => {
  api.get.mockImplementation((path) => Promise.resolve({ data: path.startsWith('/admin/qr-batches') ? []
    : path === '/admin/plans' ? [{ _id: 'plan-id', name: 'Annual', status: 'ACTIVE' }]
      : [{ _id: 'template-id', name: 'Retail card', version: 1 }] }));
  api.post.mockResolvedValue({ data: { batch: { _id: 'new-batch' } } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('QR batch print flow', () => {
  it('defaults to 100 cards and sends the selected plan, template and no-expiry setting', async () => {
    render(<MemoryRouter initialEntries={['/admin/qr-batches']}><Routes>
      <Route path="/admin/qr-batches" element={<AdminQrBatches />} />
      <Route path="/admin/qr-batches/:id" element={<p>Batch created</p>} />
    </Routes></MemoryRouter>);
    await screen.findByText('Retail card · v1');
    expect(screen.getByLabelText('Quantity').value).toBe('100');
    fireEvent.change(screen.getByLabelText('Batch name'), { target: { value: 'October print run' } });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan-id' } });
    fireEvent.change(screen.getByLabelText('Print template'), { target: { value: 'template-id' } });
    fireEvent.click(screen.getByLabelText('No redemption expiry (printed cards)'));
    fireEvent.click(screen.getByRole('button', { name: 'Create print batch' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/qr-batches', expect.objectContaining({
      name: 'October print run', planId: 'plan-id', templateId: 'template-id', quantity: 100,
      noExpiry: true, validityDays: undefined,
    })));
    expect(await screen.findByText('Batch created')).toBeTruthy();
  });
});
