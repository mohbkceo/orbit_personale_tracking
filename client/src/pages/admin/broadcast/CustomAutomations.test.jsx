import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CustomAutomations from './CustomAutomations.jsx';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../api/client.js', () => ({ api }));
let rows;
const automation = () => ({ _id: 'auto', name: 'Welcome', enabled: true, promotional: false, trigger: { type: 'REGISTRATION', configuration: {} }, audience: { type: 'ALL', planIds: [] }, messages: [{ order: 0, text: 'First', imageId: null, buttons: [], delayMinutes: 0 }] });
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  rows = []; vi.clearAllMocks();
  api.get.mockImplementation(async (url) => ({ data: url.endsWith('/plans') ? [{ _id: 'plus', name: 'Plus' }] : url.endsWith('/executions') ? [] : rows }));
  api.post.mockImplementation(async (url, body) => {
    if (url.endsWith('/preview')) return { data: { text: { text: body.automation.messages[body.messageIndex].text } } };
    if (url.endsWith('/media')) return { data: { imageId: 'image' } };
    return { data: { ...body, _id: 'auto' } };
  });
  api.put.mockImplementation(async (_url, body) => ({ data: body }));
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);
const open = async () => { render(<CustomAutomations canEdit />); fireEvent.click(await screen.findByRole('button', { name: '+ New Automation' })); fireEvent.change(screen.getByLabelText('Automation Name'), { target: { value: 'Welcome New Users' } }); };

it('creates a single-message draft from one compact editor', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Welcome!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save as Draft' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/custom-automations', expect.objectContaining({ name: 'Welcome New Users', enabled: false, messages: [expect.objectContaining({ text: 'Welcome!', delayMinutes: 0, order: 0 })] })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('adds, reorders, duplicates and removes messages while keeping independent delays', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'First' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Add Message' }));
  let second = within(screen.getByRole('region', { name: 'Message 2' }));
  fireEvent.change(second.getByLabelText('Text'), { target: { value: 'Second' } });
  fireEvent.change(second.getByLabelText('Delay for message 2'), { target: { value: '1' } });
  fireEvent.change(second.getByLabelText('Delay for message 2 unit'), { target: { value: '1440' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move message 2 up' }));
  expect(within(screen.getByRole('region', { name: 'Message 1' })).getByLabelText('Text').value).toBe('Second');
  fireEvent.click(within(screen.getByRole('region', { name: 'Message 1' })).getByRole('button', { name: 'Duplicate' }));
  expect(screen.getAllByRole('region', { name: /Message \d/ })).toHaveLength(3);
  fireEvent.click(within(screen.getByRole('region', { name: 'Message 2' })).getByRole('button', { name: 'Remove' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enable Automation' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/custom-automations', expect.objectContaining({ enabled: true, messages: [expect.objectContaining({ text: 'Second', order: 0, delayMinutes: 1440 }), expect.objectContaining({ text: 'First', order: 1, delayMinutes: 0 })] })));
});

it('supports images, link buttons, server previews and testing a chosen message', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Hello' } });
  fireEvent.change(screen.getByLabelText('Image for message 1'), { target: { files: [new File(['image'], 'image.png', { type: 'image/png' })] } });
  await screen.findByAltText('Message 1 attachment');
  fireEvent.click(screen.getByRole('button', { name: 'Add link button' }));
  fireEvent.change(screen.getByLabelText('Button label for message 1'), { target: { value: 'Open' } });
  fireEvent.change(screen.getByLabelText('Button link for message 1'), { target: { value: 'https://example.com' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send Test' }).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Send Test' }));
  await screen.findByText('Test sent to your Telegram account.');
  expect(api.post).toHaveBeenCalledWith('/admin/custom-automations/test', expect.objectContaining({ messageIndex: 0, automation: expect.objectContaining({ messages: [expect.objectContaining({ imageId: 'image', buttons: [[{ label: 'Open', url: 'https://example.com' }]] })] }) }));
});

it('shows only relevant trigger filters and edits existing automations', async () => {
  rows = [automation()]; render(<CustomAutomations canEdit />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('When to Start'), { target: { value: 'BEFORE_EXPIRY' } });
  expect(screen.queryByRole('option', { name: 'Free users' })).toBeNull();
  expect(screen.getByLabelText('Start before expiry').value).toBe('3');
  fireEvent.change(screen.getByLabelText('When to Start'), { target: { value: 'AFTER_EXPIRY' } });
  expect(screen.queryByRole('option', { name: 'Active subscribers' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save and Enable' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/custom-automations/auto', expect.objectContaining({ trigger: { type: 'AFTER_EXPIRY', configuration: {} } })));
});

it('toggles enabled state and hides editing for ordinary admins', async () => {
  rows = [automation()]; const view = render(<CustomAutomations canEdit />);
  fireEvent.click(await screen.findByRole('switch', { name: 'Enable Welcome' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/admin/custom-automations/auto/enabled', { enabled: false }));
  view.rerender(<CustomAutomations canEdit={false} />);
  expect(screen.getByRole('switch').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: '+ New Automation' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
});
