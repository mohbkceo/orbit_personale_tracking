import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import OnboardingStudio from './OnboardingStudio.jsx';
import { DEFAULT_FLOW } from '../../../../shared/onboarding.js';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  role: 'SUPER_ADMIN',
}));
vi.mock('../../api/client.js', () => ({
  api: {
    get: (...args) => mocks.get(...args),
    post: (...args) => mocks.post(...args),
    patch: (...args) => mocks.patch(...args),
  },
}));
vi.mock('../../context/useAuth.js', () => ({
  useAdminAuth: () => ({ admin: { role: mocks.role } }),
}));
vi.mock('../../context/TelegramContext.js', () => ({ useTelegram: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.role = 'SUPER_ADMIN';
});
const published = () => ({
  ...structuredClone(DEFAULT_FLOW),
  _id: 'published',
  version: 1,
  status: 'published',
  revision: 0,
});
function mount() {
  mocks.get.mockResolvedValue({ data: { activeFlow: 'published', flows: [published()] } });
  render(
    <MemoryRouter>
      <OnboardingStudio />
    </MemoryRouter>,
  );
}

describe('Onboarding Studio', () => {
  it('adds pages and questions, edits bilingual choices and saves/publishes a real definition', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Add page' }));
    fireEvent.change(screen.getByLabelText('Title · English'), {
      target: { value: 'Tell us about yourself' },
    });
    fireEvent.change(screen.getByLabelText('Title · العربية'), {
      target: { value: 'أخبرنا عن نفسك' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Question title · English'), {
      target: { value: 'Your main goal' },
    });
    fireEvent.change(screen.getByLabelText('Question title · العربية'), {
      target: { value: 'هدفك الرئيسي' },
    });
    fireEvent.change(screen.getByLabelText('Option 1 · English'), {
      target: { value: 'Save money' },
    });
    mocks.post.mockImplementation(async (path, payload) =>
      path.endsWith('/publish')
        ? { data: { _id: 'v3', version: 3 } }
        : { data: { ...payload, _id: 'draft', revision: 0, status: 'draft', version: 2 } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved. Publish when you are ready to show it to new users.');
    expect(mocks.post).toHaveBeenCalledWith(
      '/admin/onboarding/flows',
      expect.objectContaining({
        pages: expect.arrayContaining([
          expect.objectContaining({
            title: { en: 'Tell us about yourself', ar: 'أخبرنا عن نفسك' },
            questions: [
              expect.objectContaining({
                type: 'single',
                title: { en: 'Your main goal', ar: 'هدفك الرئيسي' },
                options: expect.arrayContaining([
                  expect.objectContaining({
                    emoji: '✨',
                    label: { en: 'Save money', ar: 'الخيار الأول' },
                  }),
                ]),
              }),
            ],
          }),
        ]),
      }),
    );
    const saved = mocks.post.mock.calls[0][1];
    mocks.get.mockResolvedValue({
      data: {
        activeFlow: 'v3',
        flows: [
          { ...saved, _id: 'draft', status: 'draft', revision: 1 },
          { ...saved, _id: 'v3', status: 'published', version: 3 },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Version 3 is published and active for new sessions.');
    expect(mocks.post).toHaveBeenCalledWith('/admin/onboarding/flows/draft/publish', {
      revision: 0,
    });
  });
  it('reorders pages with accessible controls and previews Arabic without API submissions', async () => {
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Move page Telegram is optional earlier' }),
    );
    const sidebar = screen.getByRole('heading', { name: 'Pages' }).closest('aside');
    const buttons = within(sidebar)
      .getAllByRole('button')
      .filter((b) => b.textContent.includes('Enabled'));
    expect(buttons[1].textContent).toContain('Telegram');
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    fireEvent.change(screen.getByLabelText('Preview language'), { target: { value: 'ar' } });
    expect(document.querySelector('main[dir="rtl"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'ربط تيليجرام اختياري' })).toBeTruthy(),
    );
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it('exposes all question types and gives changed types new stable IDs', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Add page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    const selector = screen.getByLabelText('Answer type');
    expect(within(selector).getAllByRole('option')).toHaveLength(11);
    fireEvent.change(selector, { target: { value: 'range' } });
    expect(
      screen.getByText(
        'Changing the type creates a new question ID. Historical answers keep their original definition.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByText('Advanced settings'));
    expect(screen.getByLabelText('Minimum').value).toBe('0');
    expect(screen.getByLabelText('Maximum').value).toBe('100');
    expect(screen.queryByText('Answer options')).toBeNull();
  });
  it('allows regular admins to read the studio but hides publication controls', async () => {
    mocks.role = 'ADMIN';
    mount();
    await screen.findByText('Super Admin access is required to edit and publish.');
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add page' }).closest('fieldset').disabled).toBe(
      true,
    );
  });
});
