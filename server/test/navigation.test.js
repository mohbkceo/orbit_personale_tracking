import { describe, expect, it } from 'vitest';
import { loginDestination } from '../../client/src/utils/navigation.js';

describe('login destinations', () => {
  it('keeps intended panel and activation routes', () => {
    expect(loginDestination('/panel/tasks?view=today', true)).toBe('/panel/tasks?view=today');
    expect(loginDestination('/activate/example', false)).toBe('/activate/example');
    expect(loginDestination('/money/transactions?sort=recent', true)).toBe(
      '/panel/money/transactions?sort=recent',
    );
  });
  it('uses a safe destination for external or unsupported next values', () => {
    expect(loginDestination('//other.example', true)).toBe('/panel');
    expect(loginDestination('https://other.example', true)).toBe('/panel');
    expect(loginDestination('/admin/settings', true)).toBe('/panel');
    expect(loginDestination(null, false)).toBe('/access');
  });
});
