import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n/index.js';
import { DynamicOnboarding } from './DynamicOnboarding.jsx';
import { QuestionField } from './QuestionField.jsx';
import { DEFAULT_FLOW, QUESTION_TYPES } from '../../../../shared/onboarding.js';

const telegram = vi.hoisted(() => ({
  status: { connected: false, botUrl: 'https://t.me/orbit_bot' },
  connect: vi.fn(),
  setWatching: vi.fn(),
}));
vi.mock('../../context/TelegramContext.js', () => ({ useTelegram: () => telegram }));
const title = (en, ar = 'سؤال') => ({ en, ar });
const makeQuestion = (type = 'text', extra = {}) => ({
  id: 'question',
  title: title('Your answer'),
  type,
  enabled: true,
  required: false,
  options: [{ value: 'one', label: title('Option one'), emoji: '🎯' }],
  ...(['range', 'rating'].includes(type) ? { min: 1, max: 5 } : {}),
  ...extra,
});
const makeFlow = (q = makeQuestion()) => ({
  ...structuredClone(DEFAULT_FLOW),
  _id: 'flow1',
  pages: [
    {
      ...structuredClone(DEFAULT_FLOW.pages[0]),
      id: 'profile',
      kind: 'questions',
      title: title('About you', 'معلوماتك'),
      questions: [q],
    },
    { ...structuredClone(DEFAULT_FLOW.pages[1]), id: 'done', kind: 'info' },
  ],
});
beforeEach(async () => {
  sessionStorage.clear();
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('dynamic onboarding and draft preview', () => {
  it('renders the draft, validates required fields, supports back/skip and never submits preview data', async () => {
    const submit = vi.fn();
    render(
      <DynamicOnboarding
        preview
        submit={submit}
        state={{ flow: makeFlow(makeQuestion('text', { required: true })) }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'About you' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByRole('heading', { name: 'See everything together' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByDisplayValue('Hello')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await screen.findByText('Preview finished')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });
  it('renders Arabic and RTL with progress and accessible required errors', async () => {
    const { container } = render(
      <DynamicOnboarding
        preview
        language="ar"
        state={{ flow: makeFlow(makeQuestion('text', { required: true })) }}
      />,
    );
    expect(container.querySelector('main').dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'معلوماتك' })).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'يرجى إدخال إجابة صالحة.',
    );
  });
  it('retains local unsaved input on network failure and restores it after refresh', async () => {
    const flow = makeFlow(),
      submit = vi.fn().mockRejectedValue(new Error('Offline'));
    const props = {
      state: { userId: 'u1', flow, revision: 0, status: 'IN_PROGRESS', step: 'profile' },
      submit,
    };
    const view = render(<DynamicOnboarding {...props} />);
    await screen.findByText('Offline');
    fireEvent.change(screen.getByLabelText('Your answer'), {
      target: { value: 'Keep this answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    await screen.findByText('Offline');
    view.unmount();
    render(<DynamicOnboarding {...props} />);
    expect(screen.getByDisplayValue('Keep this answer')).toBeTruthy();
  });
  it('saves on entry and advances with the latest revision without duplicate navigation requests', async () => {
    const flow = makeFlow(),
      onExit = vi.fn();
    const submit = vi
      .fn()
      .mockResolvedValueOnce({ revision: 1, step: 'profile', status: 'IN_PROGRESS' });
    render(
      <DynamicOnboarding
        state={{ flow, userId: 'u1', revision: 0 }}
        submit={submit}
        onExit={onExit}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(false));
    let resolve;
    submit.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: 'Saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: /Saving/ }));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).toMatchObject({
      revision: 1,
      action: 'next',
      answers: { question: 'Saved' },
    });
    submit.mockResolvedValue({ revision: 3, step: 'done', status: 'IN_PROGRESS' });
    resolve({ revision: 2, step: 'done', status: 'IN_PROGRESS' });
    expect(await screen.findByRole('heading', { name: 'See everything together' })).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();
  });
  it('only watches Telegram in the live Telegram step and disables its integration in preview', () => {
    render(<DynamicOnboarding preview state={{ flow: DEFAULT_FLOW, step: 'telegram' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect Telegram' }));
    expect(telegram.connect).not.toHaveBeenCalled();
    expect(telegram.setWatching).not.toHaveBeenCalled();
  });
  it.each(QUESTION_TYPES)('renders and accepts an answer for %s', (type) => {
    const change = vi.fn();
    render(<QuestionField question={makeQuestion(type)} onChange={change} language="en" />);
    if (type === 'single' || type === 'multiple')
      fireEvent.click(screen.getByLabelText(/Option one/));
    else if (type === 'yes-no') fireEvent.click(screen.getByRole('button', { name: 'No' }));
    else if (type === 'rating') fireEvent.click(screen.getByRole('button', { name: '3' }));
    else
      fireEvent.change(screen.getByLabelText('Your answer'), {
        target: {
          value:
            type === 'dropdown'
              ? 'one'
              : type === 'date'
                ? '2026-11-02'
                : ['number', 'range', 'currency'].includes(type)
                  ? '3'
                  : 'Hello',
        },
      });
    expect(change).toHaveBeenCalledOnce();
  });
});
