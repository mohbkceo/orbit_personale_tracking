export const APPEARANCE_DEFAULTS = Object.freeze({
  mode: 'system', preset: 'orbit', density: 'comfortable', radius: 'soft', motion: 'full', personality: 'balanced',
});

export const APPEARANCE_VALUES = Object.freeze({
  mode: ['light', 'dark', 'system'],
  preset: ['orbit', 'graphite', 'ocean', 'sage', 'sand', 'rose-quartz', 'lavender', 'peach'],
  density: ['comfortable', 'compact'],
  radius: ['soft', 'rounded'],
  motion: ['full', 'reduced'],
  personality: ['focus', 'balanced', 'expressive'],
});

export function resolveAppearance(appearance, legacyTheme) {
  const raw = appearance?.toObject ? appearance.toObject() : appearance || {};
  return Object.fromEntries(Object.entries(APPEARANCE_DEFAULTS).map(([key, fallback]) => [
    key, APPEARANCE_VALUES[key].includes(raw[key]) ? raw[key] : key === 'mode' && APPEARANCE_VALUES.mode.includes(legacyTheme) ? legacyTheme : fallback,
  ]));
}
