import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Goals from './Goals.jsx';
import { endpoints } from '../api/client.js';
import i18n from '../i18n/index.js';

const app = vi.hoisted(() => ({
  settings: { defaultCurrency: 'DZD', appearance: { motion: 'reduced' } },
  toast: vi.fn(),
  reward: vi.fn(),
}));
vi.mock('../context/useApp.js', () => ({ useApp: () => app }));
vi.mock('../context/CapabilitiesContext.js', () => ({
  useCapabilities: () => ({ allowed: () => true }),
}));
vi.mock('../api/client.js', () => ({
  endpoints: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('../animations/useOrbitReducedMotion.js', () => ({ useOrbitReducedMotion: () => true }));

let items;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  items = [
    {
      _id: 'money',
      title: 'Laptop',
      progressType: 'money',
      targetAmount: 1000,
      currentAmount: 200,
      status: 'active',
    },
    {
      _id: 'steps',
      title: 'Learn Arabic',
      progressType: 'steps',
      steps: [{ _id: 'one', title: 'Read', completed: false }],
      status: 'active',
    },
    { _id: 'simple', title: 'Visit family', progressType: 'simple', status: 'completed' },
  ];
  endpoints.list.mockImplementation((resource) =>
    Promise.resolve({ data: resource === 'goals' ? items : [] }),
  );
  endpoints.create.mockImplementation((_resource, input) =>
    Promise.resolve({ data: { ...input, _id: 'new', status: 'active' } }),
  );
  endpoints.update.mockImplementation((_resource, id, input) =>
    Promise.resolve({ data: { ...items.find((item) => item._id === id), ...input } }),
  );
  endpoints.remove.mockResolvedValue({ data: { deleted: true } });
});
afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en');
});
const mount = (path = '/panel/planning/goals') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Goals />
    </MemoryRouter>,
  );

describe('unified Goals interface', () => {
  it('shows one creation button, relevant card content and simple filters', async () => {
    mount();
    await screen.findByText('Laptop');
    expect(screen.getAllByRole('button', { name: 'Add Goal' })).toHaveLength(1);
    expect(screen.queryByText('Wishlist')).toBeNull();
    const simpleCard = screen.getByText('Visit family').closest('button');
    expect(within(simpleCard).queryByRole('progressbar')).toBeNull();
    expect(
      within(screen.getByText('Learn Arabic').closest('button')).getByText('Steps remaining: 1'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Completed', exact: true }));
    expect(screen.queryByText('Laptop')).toBeNull();
    expect(screen.getByText('Visit family')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Active', exact: true }));
    expect(screen.queryByText('Visit family')).toBeNull();
  });
  it('creates a title-only goal with secondary fields collapsed', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add Goal' }));
    const dialog = screen.getByRole('dialog', { name: 'Add Goal' });
    expect(within(dialog).getAllByRole('radio')).toHaveLength(3);
    expect(within(dialog).queryByLabelText('Target amount')).toBeNull();
    expect(dialog.querySelector('details').open).toBe(false);
    fireEvent.change(within(dialog).getByLabelText('Goal title'), {
      target: { value: 'A new plan' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(endpoints.create).toHaveBeenCalledWith(
        'goals',
        expect.objectContaining({ title: 'A new plan', progressType: 'simple', targetDate: null }),
      ),
    );
    expect(endpoints.create.mock.calls[0][1]).not.toHaveProperty('currentAmount');
    expect(endpoints.create.mock.calls[0][1]).not.toHaveProperty('steps');
  });
  it('shows money fields only for saving goals and leaves deadline optional', async () => {
    mount('/panel/planning/goals?add=1');
    fireEvent.click(screen.getByRole('radio', { name: 'Save money' }));
    expect(screen.getByLabelText('Target amount').required).toBe(false);
    expect(screen.getByLabelText('Already saved')).toBeTruthy();
    expect(screen.getByLabelText('Deadline (optional)').required).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'Complete steps' }));
    expect(screen.queryByLabelText('Target amount')).toBeNull();
    expect(screen.queryByLabelText('New step')).toBeNull();
  });
  it('opens goal details from search links and updates a checklist', async () => {
    endpoints.update.mockResolvedValue({
      data: {
        ...items[1],
        steps: [{ ...items[1].steps[0], completed: true }],
        status: 'completed',
      },
    });
    mount('/panel/planning/goals?goal=steps');
    const dialog = await screen.findByRole('dialog', { name: 'Learn Arabic' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Complete Read' }));
    await waitFor(() =>
      expect(endpoints.update).toHaveBeenCalledWith('goals/steps/steps', 'one', {
        completed: true,
      }),
    );
    fireEvent.change(within(dialog).getByLabelText('New step'), { target: { value: 'Practice' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add step' }));
    await waitFor(() =>
      expect(endpoints.create).toHaveBeenCalledWith('goals/steps/steps', { title: 'Practice' }),
    );
  });
  it('requires confirmation to delete and keeps cancellation safe', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount('/panel/planning/goals?goal=simple');
    const dialog = await screen.findByRole('dialog', { name: 'Visit family' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete goal' }));
    expect(endpoints.remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete goal' }));
    await waitFor(() => expect(endpoints.remove).toHaveBeenCalledWith('goals', 'simple'));
    confirm.mockRestore();
  });
  it('renders translated controls and mobile dialogs in Arabic RTL', async () => {
    await i18n.changeLanguage('ar');
    mount();
    await screen.findByText('Laptop');
    expect(document.documentElement.dir).toBe('rtl');
    expect(screen.getByRole('heading', { name: 'الأهداف' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إضافة هدف' }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة هدف' });
    expect(within(dialog).getByRole('radio', { name: 'ادخار المال' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'إكمال خطوات' })).toBeTruthy();
    expect(within(dialog).getByRole('radio', { name: 'تتبع الحالة' })).toBeTruthy();
    expect(dialog.className).toContain('max-h-[92vh]');
  });
});
