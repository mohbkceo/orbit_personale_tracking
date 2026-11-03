// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminQrPrintTemplateEditor } from './QrPrintTemplates.jsx';
import { api } from '../../api/client.js';

vi.mock('../../api/client.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock('../../components/ui.jsx', () => ({
  PageHeader: ({ title, actions }) => <header><h1>{title}</h1>{actions}</header>,
  Spinner: ({ label }) => <div>{label}</div>,
}));
vi.mock('react-konva', () => ({
  Stage: ({ children }) => <div data-testid="design-canvas">{children}</div>,
  Layer: ({ children }) => <div>{children}</div>,
  Group: ({ children, onClick }) => <div onClick={onClick}>{children}</div>,
  Text: ({ text, onClick }) => <span onClick={onClick}>{text}</span>,
  Rect: () => null, Line: () => null, Circle: () => null, Ellipse: () => null,
  Image: () => null, Transformer: () => null,
}));

const existing = () => ({
  _id: 'existing', name: 'Existing card', widthMm: 97, heightMm: 55,
  background: { type: 'color', color: '#ffffff' },
  elements: [
    { id: 'b13c4edc-cf65-41a4-b744-743fd67ab91e', type: 'qr', variable: 'QR_CODE',
      x: 64, y: 10, w: 28, h: 28, rotation: 0, opacity: 1, locked: false,
      foreground: '#111111', background: '#ffffff' },
  ],
});
let sequence = 0;
function renderEditor(id = 'new') {
  render(<MemoryRouter initialEntries={['/admin/qr-batches/print-templates/' + id]}>
    <Routes><Route path="/admin/qr-batches/print-templates/:id" element={<AdminQrPrintTemplateEditor />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  sequence = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('crypto', {
    randomUUID: () => '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0'),
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.get.mockImplementation(async () => ({ data: existing() }));
  api.post.mockImplementation(async (_path, body) => ({ data: { ...body, _id: 'saved' } }));
  api.patch.mockImplementation(async (_path, body) => ({ data: { ...body, _id: 'existing' } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('Card template builder', () => {
  it('provides a live canvas and lets a new user save a starter layout with exactly one QR code', async () => {
    renderEditor();
    expect(screen.getByTestId('design-canvas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Clean/ }));
    expect(screen.getByText('YOUR BRAND')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/qr-print-templates', expect.any(Object)));
    const design = api.post.mock.calls[0][1];
    expect(design.elements.filter((element) => element.type === 'qr')).toHaveLength(1);
    expect(design.elements.some((element) => element.type === 'text' && element.text === 'YOUR BRAND')).toBe(true);
  });

  it('inserts text, opens its simple editing panel, and saves custom text', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const editor = screen.getByRole('textbox', { name: 'Text' });
    fireEvent.change(editor, { target: { value: 'Special offer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].elements.some((element) =>
      element.type === 'text' && element.text === 'Special offer')).toBe(true);
  });

  it('undoes insertion without removing the required QR code', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByText('Your text')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(screen.queryByText('Your text')).toBeNull();
  });

  it('loads an existing design and allows editing its card background', async () => {
    renderEditor('existing');
    await screen.findByDisplayValue('Existing card');
    expect(screen.getByTestId('design-canvas')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Background color'), { target: { value: '#eb4300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/qr-print-templates/existing', expect.any(Object)));
    expect(api.patch.mock.calls[0][1].background.color).toBe('#eb4300');
  });
});
