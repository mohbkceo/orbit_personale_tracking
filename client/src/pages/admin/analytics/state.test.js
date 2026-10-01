import { describe, expect, it } from 'vitest';
import { comparison, previousPeriod, readAnalyticsState, reportParams } from './state.js';

describe('analytics URL state', () => {
  it('restores validated date, filters and attribution from a shareable URL', () => {
    const state = readAnalyticsState(
      '?from=2026-09-01&to=2026-09-30&source=Meta&campaign=Launch&model=firstTouch&compare=previous',
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(state).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      model: 'firstTouch',
      compare: true,
      filters: { source: 'Meta', campaign: 'Launch' },
    });
    expect(reportParams(state)).toMatchObject({
      source: 'Meta',
      campaign: 'Launch',
      model: 'firstTouch',
    });
    expect(previousPeriod(state)).toMatchObject({ from: '2026-08-02', to: '2026-08-31' });
  });
  it('ignores invalid dates and attribution values', () => {
    const state = readAnalyticsState(
      '?from=2026-02-31&to=bad&model=constructor',
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(state).toMatchObject({ from: '2026-09-02', to: '2026-10-01', model: 'lastTouch' });
  });
  it('computes comparison deltas without dividing by zero', () => {
    expect(comparison(12, 10)).toMatchObject({ direction: 'up' });
    expect(comparison(2, 0)).toMatchObject({ text: 'New' });
    expect(comparison(0, 0)).toMatchObject({ direction: 'flat' });
  });
});
