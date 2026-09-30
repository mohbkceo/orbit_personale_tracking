export const defaults = Object.freeze({ mode: 'system', preset: 'orbit', density: 'comfortable', radius: 'soft', motion: 'full', personality: 'balanced' });

export const tokenNames = ['canvas','surface','surface-alt','text','muted','primary','primary-hover','primary-text','accent','border','success','warning','danger','sidebar','sidebar-text','sidebar-muted','sidebar-hover','sidebar-selected','hover','selected'];

// Presets share neutral surfaces and change the accent, selection and data colors.
const presets = {
  orbit: { name: 'Orbit', description: 'Clear neutrals with Orbit orange', light: '#bd4d16', dark: '#ff945f', accent: '#ff6b25' },
  graphite: { name: 'Graphite', description: 'Quiet slate accents', light: '#465b6b', dark: '#adc4d2' },
  ocean: { name: 'Ocean', description: 'Calm blue accents', light: '#176d9a', dark: '#78c6eb' },
  sage: { name: 'Sage', description: 'Soft botanical accents', light: '#39704f', dark: '#9bd4ac' },
  sand: { name: 'Sand', description: 'Warm brass accents', light: '#93652e', dark: '#e3be83' },
  'rose-quartz': { name: 'Rose Quartz', description: 'Muted rose accents', light: '#a25472', dark: '#e8a9c2' },
  lavender: { name: 'Lavender', description: 'Gentle violet accents', light: '#6c5caa', dark: '#bab0f2' },
  peach: { name: 'Peach', description: 'Warm coral accents', light: '#a95136', dark: '#f1ae94' },
};

function mix(first, second, portion) {
  const channel = (hex, offset) => parseInt(hex.slice(offset, offset + 2), 16);
  return `#${[1, 3, 5].map((offset) => Math.round(channel(first, offset) * (1 - portion) + channel(second, offset) * portion).toString(16).padStart(2, '0')).join('')}`;
}

function palette(primary, dark, accent = primary) {
  const canvas = dark ? '#171b20' : '#fafafa';
  const surface = dark ? '#20252b' : '#ffffff';
  const text = dark ? '#edf0f3' : '#15181d';
  const border = dark ? '#363d45' : '#e7eaef';
  const soft = mix(surface, accent, dark ? .13 : .07);
  const sidebar = dark ? '#1d2228' : '#fbfcfd';
  const sidebarSelected = mix(sidebar, accent, dark ? .13 : .06);
  return [
    canvas, surface, dark ? '#272d34' : '#f5f6f8', text, dark ? '#a4adb8' : '#697483',
    primary, mix(primary, dark ? '#ffffff' : '#15181d', dark ? .13 : .14), dark ? '#171b20' : '#ffffff', accent,
    border, dark ? '#6fc49a' : '#20754c', dark ? '#e7ba70' : '#925c18', dark ? '#ec8994' : '#b94050',
    sidebar, text, dark ? '#a4adb8' : '#667282',
    dark ? '#292f36' : '#f3f5f7', sidebarSelected, dark ? '#2a3037' : '#f5f6f8', soft,
  ];
}

export const themes = Object.freeze(Object.fromEntries(Object.entries(presets).map(([key, preset]) => [key, {
  name: preset.name, description: preset.description,
  light: palette(preset.light, false, preset.accent), dark: palette(preset.dark, true),
}])));

const recommendations = { MALE: ['orbit','graphite','ocean','sand'], FEMALE: ['sage','rose-quartz','lavender','peach'] };
export function recommendedThemes(gender) { return recommendations[gender] || ['orbit','sage','ocean','graphite']; }
export function orderedThemes(gender) {
  const recommended = recommendedThemes(gender);
  return [...recommended, ...Object.keys(themes).filter((key) => !recommended.includes(key))];
}
export function normalizeAppearance(value, legacyTheme) {
  return { ...defaults, ...(value || {}), mode: value?.mode || legacyTheme || defaults.mode };
}
export function isDarkMode(mode, media = window.matchMedia('(prefers-color-scheme: dark)')) {
  return mode === 'dark' || (mode === 'system' && media.matches);
}
function rgb(hex) { return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(' '); }
export function themeVariables(preset, dark = false) {
  const colors = (themes[preset] || themes.orbit)[dark ? 'dark' : 'light'];
  return Object.fromEntries(tokenNames.map((name, index) => [`--color-${name}`, rgb(colors[index])]));
}
export function previewStyle(preset, dark = false) { return themeVariables(preset, dark); }
export function paletteColor(preset, dark, token) {
  return (themes[preset] || themes.orbit)[dark ? 'dark' : 'light'][tokenNames.indexOf(token)];
}
export function applyAppearance(appearance, media) {
  const root = document.documentElement;
  const dark = isDarkMode(appearance.mode, media);
  root.classList.toggle('dark', dark);
  root.dataset.preset = appearance.preset;
  root.dataset.personality = appearance.personality;
  root.dataset.density = appearance.density;
  root.dataset.radius = appearance.radius;
  root.dataset.motion = appearance.motion;
  for (const [key, value] of Object.entries(themeVariables(appearance.preset, dark))) root.style.setProperty(key, value);
}
