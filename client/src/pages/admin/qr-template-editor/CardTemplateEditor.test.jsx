import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { openPrintPdf } from '../printPdf.js';
import { AdminQrPrintTemplateEditor } from './CardTemplateEditor.jsx';
import { createDesign, elementLabel } from './design.js';

vi.mock('../../../api/client.js', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('../printPdf.js', () => ({ openPrintPdf: vi.fn() }));
// Actual Konva pointer/resize behavior is exercised in the browser; this suite
// checks the surrounding React workflows without jsdom's absent Canvas API.
vi.mock('./CardCanvas.jsx', () => ({
  CardCanvas: ({ template, select }) => (
    <div>
      {template.elements.map((element) => (
        <button
          key={element.id}
          onClick={() => select(element.id)}
        >{`Canvas: ${elementLabel(element)}`}</button>
      ))}
    </div>
  ),
}));

let stored;
function editor(path = 'new') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[`/admin/qr-batches/print-templates/${path}`]}>
        <Routes>
          <Route
            path="/admin/qr-batches/print-templates/:id"
            element={<AdminQrPrintTemplateEditor />}
          />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
}
beforeEach(() => {
  stored = { ...createDesign(), _id: 'saved-card', version: 1 };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  api.get.mockImplementation(async () => ({ data: structuredClone(stored) }));
  api.post.mockImplementation(async (path, body) => {
    if (path.endsWith('/assets')) return { data: { _id: '507f1f77bcf86cd799439011' } };
    stored = { ...structuredClone(body), _id: 'saved-card', version: 1 };
    return { data: stored };
  });
  api.patch.mockImplementation(async (_path, body) => {
    stored = { ...structuredClone(body), _id: 'saved-card', version: 2 };
    return { data: stored };
  });
  openPrintPdf.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('card template editor workflows', () => {
  it('adds and selects text, edits, saves with the existing contract, then reloads it', async () => {
    const view = editor();
    fireEvent.click(screen.getByRole('button', { name: 'Text', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a heading' }));
    fireEvent.change(screen.getByLabelText('Text content'), {
      target: { value: 'Welcome aboard' },
    });
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'Retail launch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await screen.findByText('All changes saved');
    expect(api.post).toHaveBeenCalledWith(
      '/admin/qr-print-templates',
      expect.objectContaining({ name: 'Retail launch', widthMm: 97, heightMm: 55 }),
    );
    expect(Object.keys(api.post.mock.calls[0][1]).sort()).toEqual(
      ['name', 'widthMm', 'heightMm', 'background', 'elements'].sort(),
    );
    view.unmount();
    editor('saved-card');
    await screen.findByDisplayValue('Retail launch');
    expect(screen.getByRole('button', { name: 'Canvas: Welcome aboard' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Retail v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        '/admin/qr-print-templates/saved-card',
        expect.objectContaining({ name: 'Retail v2' }),
      ),
    );
  });

  it('supports keyboard history, duplicate, locking, deletion, and friendly fields', () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Dynamic Fields' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Plan Name' }));
    expect(screen.getByLabelText('Dynamic field').value).toBe('PLAN_NAME');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate element' }));
    expect(screen.getAllByRole('button', { name: 'Canvas: Plan Name' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Lock element' }));
    expect(screen.getByLabelText('Delete element').disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Design canvas'), { key: 'Delete' });
    expect(screen.getAllByRole('button', { name: 'Canvas: Plan Name' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Unlock element' }));
    fireEvent.keyDown(screen.getByLabelText('Design canvas'), { key: 'Delete' });
    expect(screen.getAllByRole('button', { name: 'Canvas: Plan Name' })).toHaveLength(1);
    fireEvent.keyDown(screen.getByLabelText('Design canvas'), { key: 'z', ctrlKey: true });
    expect(screen.getAllByRole('button', { name: 'Canvas: Plan Name' })).toHaveLength(2);
    fireEvent.keyDown(screen.getByLabelText('Design canvas'), {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(screen.getAllByRole('button', { name: 'Canvas: Plan Name' })).toHaveLength(1);
  });

  it('keeps exactly one QR, validates contrast locally, and previews the current draft', async () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'QR Code', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Select QR code' }));
    expect(screen.getByLabelText('Duplicate element').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('QR color'), { target: { value: '#eeeeee' } });
    expect(screen.getByRole('button', { name: 'Save', exact: true }).disabled).toBe(true);
    expect(screen.getByText(/Choose a darker QR color/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('QR color'), { target: { value: '#111111' } });
    fireEvent.click(screen.getByLabelText('Delete element'));
    expect(screen.getByText(/Add exactly one QR code/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Preview PDF' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add QR code', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    await waitFor(() =>
      expect(openPrintPdf).toHaveBeenCalledWith(
        '/admin/qr-print-templates/preview.pdf',
        'sample-print-card.pdf',
        expect.objectContaining({ widthMm: 97 }),
        { preview: true },
      ),
    );
    expect(openPrintPdf.mock.calls[0][2].elements.filter((e) => e.type === 'qr')).toHaveLength(1);
  });

  it('validates uploads near the controls and selects a successfully uploaded image', async () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Images', exact: true }));
    fireEvent.change(screen.getByLabelText('Upload image'), {
      target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] },
    });
    expect(screen.getAllByText('Choose a PNG or JPG image up to 2 MB.').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Upload image'), {
      target: { files: [new File(['png'], 'logo.png', { type: 'image/png' })] },
    });
    await screen.findByLabelText('Crop zoom');
    expect(screen.getByRole('button', { name: 'Canvas: Image' })).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith(
      '/admin/qr-print-templates/assets',
      expect.any(File),
      expect.objectContaining({ headers: { 'Content-Type': 'image/png' } }),
    );
  });

  it('shows name validation and makes applying a preset reversible', () => {
    editor();
    const original = screen.getAllByRole('button', { name: /^Canvas:/ }).length;
    fireEvent.click(screen.getByRole('button', { name: 'Use A little Orbit layout' }));
    expect(screen.getAllByRole('button', { name: /^Canvas:/ })).toHaveLength(original + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('button', { name: /^Canvas:/ })).toHaveLength(original);
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: '  ' } });
    expect(screen.getByText('Give your template a name.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save', exact: true }).disabled).toBe(true);
  });

  it('shows save and preview failures without losing the draft', async () => {
    api.post.mockRejectedValueOnce(new Error('Save failed. Try again.'));
    openPrintPdf.mockRejectedValueOnce(new Error('PDF could not be prepared.'));
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    await screen.findByText('Save failed. Try again.');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));
    await screen.findByText('PDF could not be prepared.');
    expect(
      within(screen.getByRole('region', { name: 'Card template editor' })).getByLabelText(
        'Template name',
      ).value,
    ).toBe('Untitled card');
  });
});
