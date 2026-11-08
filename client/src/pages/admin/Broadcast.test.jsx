import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminBroadcast from './Broadcast.jsx';
import { broadcastPayload, newBroadcast, presetSelection, toggleUser } from './broadcastModel.js';

const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('../../api/client.js', () => ({ api }));
let role = 'SUPER_ADMIN';
vi.mock('../../context/useAuth.js', () => ({ useAdminAuth: () => ({ admin: { role } }) }));
const template = { key: 'focus-morning', name: 'Daily Focus morning planning', category: 'FOCUS', enabled: true, variables: ['legacyTitle', 'legacyMessage', 'completedCount'], timing: 'automation.dailyFocus', timingFields: [{ field: 'morningTime', type: 'time', label: 'Morning reminder', value: '08:00' }], variants: { en: { title: '{legacyTitle}', body: '{legacyMessage}' }, ar: { title: '{legacyTitle}', body: '{legacyMessage}' } }, buttons: [[{ label: 'Open Orbit', url: 'https://example.com' }]], imageId: '123456789012345678901234' };
const user = (id) => ({ _id: String(id), fullName: `Person ${id}`, email: `person${id}@example.com`, connected: true, status: 'ACTIVE' });
let saved;
let campaigns;
let usersRequests;
let previewRequests;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  vi.clearAllMocks(); role = 'SUPER_ADMIN'; saved = null; campaigns = []; usersRequests = []; previewRequests = [];
  api.get.mockImplementation(async (url) => {
    if (url === '/admin/broadcasts') return { data: campaigns, pagination: { page: 1, pages: 1 } };
    if (url.endsWith('/test-recipient')) return { data: { userId: 'self' } };
    if (url.endsWith('/plans')) return { data: [{ _id: 'plan', name: 'Annual' }] };
    if (url.endsWith('/audience')) return { data: { targeted: 8, deliverable: 5 } };
    if (url === '/admin/automatic-messages') return { data: [template] };
    return { data: saved || campaigns[0] };
  });
  api.post.mockImplementation(async (url, body) => {
    if (url === '/admin/broadcasts') { saved = { ...body, _id: 'campaign', status: 'DRAFT' }; return { data: saved }; }
    if (url.endsWith('/media')) return { data: { imageId: 'image' } };
    if (url.endsWith('/users')) { usersRequests.push(body); return { data: { rows: body.page === 2 ? [user(26)] : [user(1), user(2)], total: 26 } }; }
    if (url.endsWith('/preview')) {
      previewRequests.push(body);
      return { data: url.includes('automatic-messages') ? { title: 'Daily Focus', message: 'Plan your 3 tasks today.' } : { text: { text: '<b>Hello</b>' } } };
    }
    if (url.endsWith('/duplicate')) return { data: { ...campaigns[0], _id: 'copy', status: 'DRAFT' } };
    return { data: {} };
  });
  api.put.mockImplementation(async (_url, body) => { saved = { ...body, _id: 'campaign', status: 'DRAFT' }; return { data: saved }; });
});
afterEach(cleanup);
const renderPage = (path = '/admin/broadcast') => render(<MemoryRouter initialEntries={[path]}><AdminBroadcast /></MemoryRouter>);
async function composer() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'New Broadcast' }));
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: '<b>Hello</b>' } });
}
function authorize() { fireEvent.change(screen.getByLabelText('Confirm admin password to send'), { target: { value: 'password' } }); }

describe('simple broadcast composer', () => {
  it('has only two sections and confirms server eligibility before sending once', async () => {
    await composer();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Broadcasts', 'Auto Messages']);
    expect(screen.getByRole('button', { name: 'Send Now' }).disabled).toBe(true);
    authorize(); fireEvent.click(screen.getByRole('button', { name: 'Send Now' }));
    const confirmation = await screen.findByRole('dialog', { name: 'Send this broadcast to 5 eligible users?' });
    expect(within(confirmation).getByText('3')).toBeTruthy();
    expect(saved.variants.ar.text).toBe('<b>Hello</b>');
    expect(saved.category).toBe('ANNOUNCEMENT');
    expect(api.post.mock.calls.some(([url]) => url.endsWith('/launch'))).toBe(false);
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Message'));
    fireEvent.click(screen.getByRole('button', { name: 'Send Now' }));
    const secondConfirmation = await screen.findByRole('dialog', { name: 'Send this broadcast to 5 eligible users?' });
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: 'Send' }));
    await screen.findByText('Broadcast queued for sending.');
    expect(api.post.mock.calls.filter(([url]) => url.endsWith('/launch'))).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('uploads an image, edits link buttons, sends a test, and reuses its draft', async () => {
    await composer();
    fireEvent.change(screen.getByLabelText('Upload image'), { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } });
    await screen.findByAltText('Broadcast attachment');
    fireEvent.click(screen.getByRole('button', { name: 'Add link button' }));
    expect(screen.getByRole('button', { name: 'Save draft' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Button label'), { target: { value: 'Open Orbit' } });
    fireEvent.change(screen.getByLabelText('Button URL'), { target: { value: 'https://example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Test' }));
    await screen.findByText('Test sent to your Telegram account.');
    expect(saved.imageId).toBe('image'); expect(saved.buttons[0][0].url).toBe('https://example.com');
    expect(api.post).toHaveBeenCalledWith('/admin/broadcasts/campaign/test', { recipientUserId: 'self', language: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove button Open Orbit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    expect(saved.buttons).toEqual([]); expect(saved.imageId).toBeNull();
    expect(api.post.mock.calls.filter(([url]) => url === '/admin/broadcasts')).toHaveLength(1);
  });
  it('keeps individual selections across pages and searches without narrowing delivery', async () => {
    await composer();
    fireEvent.change(screen.getByLabelText('Recipients'), { target: { value: 'select' } });
    fireEvent.click(await screen.findByLabelText('Select Person 1'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByLabelText('Select Person 26'));
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'Person' } });
    await waitFor(() => expect(usersRequests.at(-1).selection.filters.search).toBe('Person'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    expect(saved.audience.includeIds).toEqual(['1', '26']);
    expect(saved.audience.filters.search).toBe('');
    expect(usersRequests.every((request) => request.selection.allMatching && !request.selection.includeIds.length)).toBe(true);
  });
  it('selects all matching users across pages and supports exclusions and clearing', async () => {
    await composer(); fireEvent.change(screen.getByLabelText('Recipients'), { target: { value: 'select' } });
    await screen.findByLabelText('Select Person 1');
    fireEvent.change(screen.getByLabelText('Subscription plan'), { target: { value: 'plan' } });
    await waitFor(() => expect(usersRequests.at(-1).selection.filters.planIds).toEqual(['plan']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select all 26' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Select all 26' }));
    expect(screen.getByLabelText('Search users').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const selected = await screen.findByLabelText('Select Person 26');
    expect(selected.checked).toBe(true); fireEvent.click(selected);
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    expect(saved.audience.allMatching).toBe(true); expect(saved.audience.excludeIds).toEqual(['26']); expect(saved.audience.filters.planIds).toEqual(['plan']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('0 selected')).toBeTruthy(); expect(screen.getByLabelText('Search users').disabled).toBe(false);
  });
  it('schedules a future date and preserves the local-to-UTC conversion', async () => {
    await composer(); authorize(); fireEvent.click(screen.getByLabelText('Schedule for later'));
    fireEvent.change(screen.getByLabelText('Scheduled time'), { target: { value: '2031-01-15T14:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule', exact: true }));
    const confirmation = await screen.findByRole('dialog', { name: /5 eligible users/ });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Send', exact: true }));
    await screen.findByText('Broadcast scheduled.');
    expect(api.post).toHaveBeenCalledWith('/admin/broadcasts/campaign/launch', { confirmation: 'SEND', adminPassword: 'password', scheduledAt: new Date('2031-01-15T14:30').toISOString() });
  });
  it('keeps a failed send editable and shows the actual error', async () => {
    await composer(); authorize();
    api.post.mockImplementationOnce(async () => { throw new Error('Unsupported Telegram formatting'); });
    fireEvent.click(screen.getByRole('button', { name: 'Send Now' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe('Unsupported Telegram formatting');
    expect(screen.queryByRole('dialog', { name: /eligible users/ })).toBeNull();
    expect(screen.getByLabelText('Message').value).toBe('<b>Hello</b>');
  });
});

describe('history and automatic messages', () => {
  it('shows readable history and relevant actions, and duplicates into the composer', async () => {
    campaigns = [{ ...newBroadcast(), _id: 'history', status: 'COMPLETED', createdAt: '2026-11-01', variants: { en: { text: '<b>Hello</b>' }, ar: { text: 'مرحبا' } }, stats: { eligible: 148, sent: 145, failed: 3 } }];
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /145 sent · 3 failed/ }));
    const details = await screen.findByRole('dialog', { name: 'Broadcast details' });
    expect(within(details).getByRole('button', { name: 'Retry failed recipients' })).toBeTruthy();
    expect(within(details).queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(within(details).queryByText(/lease|Attempts|Revision history/)).toBeNull();
    fireEvent.click(within(details).getByRole('button', { name: 'Duplicate broadcast' }));
    await screen.findByRole('dialog', { name: 'Edit Broadcast' });
  });
  it('edits unsaved content and timing with readable dynamic fields and preserves hidden media/buttons', async () => {
    renderPage('/admin/broadcast?section=auto');
    fireEvent.click(await screen.findByRole('button', { name: /Morning reminder/ }));
    const field = screen.getByLabelText('Message text');
    expect(field.value).toBe('‹Reminder details›');
    fireEvent.change(field, { target: { value: 'Today: ‹Completed tasks› completed.' } });
    fireEvent.change(screen.getByLabelText('Morning reminder', { selector: 'input' }), { target: { value: '08:30' } });
    await waitFor(() => expect(previewRequests.at(-1)?.content?.variants.en.body).toBe('Today: {completedCount} completed.'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await screen.findByText('Changes saved.');
    expect(api.put).toHaveBeenCalledWith('/admin/automatic-messages/focus-morning', expect.objectContaining({ timing: { morningTime: '08:30' }, buttons: template.buttons, imageId: template.imageId, variants: expect.objectContaining({ en: { title: '{legacyTitle}', body: 'Today: {completedCount} completed.' } }) }));
  });
  it('toggles automations while preserving existing content', async () => {
    renderPage('/admin/broadcast?section=auto');
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable Morning reminder' }));
    await screen.findByText('Morning reminder disabled.');
    expect(api.put).toHaveBeenCalledWith('/admin/automatic-messages/focus-morning', expect.objectContaining({ enabled: false, variants: template.variants }));
  });
  it('keeps restricted actions unavailable to ordinary admins', async () => {
    role = 'ADMIN'; await composer();
    expect(screen.queryByRole('button', { name: 'Send Now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close New Broadcast' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Auto Messages' }));
    expect((await screen.findByRole('switch', { name: 'Enable Morning reminder' })).disabled).toBe(true);
  });
});

describe('audience compatibility', () => {
  it('keeps explicit and all-matching selections separate and fills a missing language only', () => {
    const selection = toggleUser(presetSelection('select'), 'one');
    expect(toggleUser(selection, 'two').includeIds).toEqual(['one', 'two']);
    expect(toggleUser(presetSelection('all'), 'one').excludeIds).toEqual(['one']);
    const draft = newBroadcast(); draft.variants.en.text = 'Hello'; draft.variants.ar.text = 'مرحبا';
    expect(broadcastPayload(draft).variants.ar.text).toBe('مرحبا');
    expect(presetSelection('active').filters.subscription).toBe('ACTIVE');
    expect(presetSelection('free').filters.subscription).toBe('FREE');
  });
});
