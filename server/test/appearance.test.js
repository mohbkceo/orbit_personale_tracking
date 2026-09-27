import { describe, expect, it } from 'vitest';
import { isDarkMode, orderedThemes, recommendedThemes, themes, themeVariables } from '../../client/src/appearance/themes.js';
import { resolveAppearance } from '../src/config/appearance.js';

describe('workspace appearance', () => {
  it('recommends by gender without removing or locking any style', () => {
    expect(recommendedThemes('MALE')).toEqual(['orbit', 'graphite', 'ocean', 'sand']);
    expect(recommendedThemes('FEMALE')).toEqual(['sage', 'rose-quartz', 'lavender', 'peach']);
    for (const gender of ['MALE', 'FEMALE', null]) expect(orderedThemes(gender).sort()).toEqual(Object.keys(themes).sort());
  });

  it('supports distinct complete palettes for every style in light and dark', () => {
    for (const preset of Object.keys(themes)) {
      for (const dark of [false, true]) expect(Object.keys(themeVariables(preset, dark))).toHaveLength(20);
      expect(themes[preset].light.slice(0, 4)).not.toEqual(themes[preset].dark.slice(0, 4));
    }
  });

  it('resolves old modes and tracks system preference', () => {
    expect(resolveAppearance(undefined, 'light').mode).toBe('light');
    expect(resolveAppearance(undefined, 'dark').mode).toBe('dark');
    expect(resolveAppearance(undefined, 'system').mode).toBe('system');
    expect(isDarkMode('system', { matches: true })).toBe(true);
    expect(isDarkMode('system', { matches: false })).toBe(false);
    expect(isDarkMode('dark', { matches: false })).toBe(true);
    expect(isDarkMode('light', { matches: true })).toBe(false);
  });
});
