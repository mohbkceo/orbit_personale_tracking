export const defaults = Object.freeze({ mode: 'system', preset: 'orbit', density: 'comfortable', radius: 'soft', motion: 'full', personality: 'balanced' });

// Every preset owns its full surface and interaction palette in both modes.
// Values are consumed only through semantic CSS variables by the application.
export const themes = Object.freeze({
  orbit: { name: 'Orbit', description: 'The original calm green workspace', light: ['#f6f7f2','#ffffff','#eef3ed','#15211c','#657168','#1f6f54','#175b45','#ffffff','#d7ef72','#dde2dc','#24835e','#a26b18','#bd4756','#15211c','#f4faf4','#9aaca0','#294338','#315c49','#edf3eb','#dfeadf'], dark: ['#0d1310','#151c18','#1d2921','#edf4ef','#aeb8b1','#77d7ad','#99e6c0','#102019','#d7ef72','#34433a','#77d7ad','#e8bc65','#f0909b','#101b15','#edf4ef','#9aaea0','#23392b','#305442','#24372a','#355441'] },
  graphite: { name: 'Graphite', description: 'Quiet mineral surfaces and sharp contrast', light: ['#f2f3f4','#ffffff','#e9ecee','#20262c','#677078','#3c5263','#293c4a','#ffffff','#b2c7d0','#d6dce0','#327a66','#a87531','#bb5260','#222b33','#f3f7f8','#a8b5bd','#36434c','#455765','#e5eaed','#dce5ea'], dark: ['#111518','#1b2226','#252e33','#edf1f2','#aab5ba','#adc6d2','#c5d7df','#152027','#b8d4c2','#39464d','#91c9ae','#deb579','#ec9299','#151d22','#eef3f4','#a6b7bd','#2b3941','#3c4e59','#293941','#40545f'] },
  ocean: { name: 'Ocean', description: 'Deep blue navigation and open, airy surfaces', light: ['#f1f6f8','#ffffff','#e7f0f3','#17313c','#607985','#176887','#11536e','#ffffff','#77c7b6','#cfdee4','#21816e','#a47b25','#b84d62','#123a50','#eff9fb','#a9c6d1','#1d5267','#26647a','#e5f1f5','#d8eaf0'], dark: ['#0b1921','#112530','#19333d','#e8f4f5','#a2bcc3','#70c7dc','#9bd9e8','#10232d','#8dd6bd','#2d4b56','#81d2b8','#e5be73','#f0919e','#0b2432','#eaf8fa','#98bbc6','#1c4252','#276176','#1a3b49','#2c5868'] },
  sage: { name: 'Sage', description: 'Botanical neutrals and soft editorial contrast', light: ['#f5f6f0','#fffefa','#edf1e8','#25342a','#6a7669','#52795d','#3d654b','#ffffff','#b9ad70','#dce3d7','#4e8a67','#a87a32','#b45563','#304435','#f8faf4','#b3c3b3','#45624a','#57765b','#ebf2e8','#e1ecdf'], dark: ['#111a15','#1a271e','#26352a','#edf2e9','#afbdad','#a4c99e','#bcdbb4','#17271b','#d3bf83','#3c4d3e','#93ceaa','#dbba79','#eb97a0','#1b2d21','#edf4e9','#a4b9a5','#304c37','#426849','#2e4533','#45634b'] },
  sand: { name: 'Sand', description: 'Warm paper, deep ink, and brass details', light: ['#f8f5ed','#fffdf8','#f1eadc','#362d25','#817568','#8b633c','#72502f','#ffffff','#b8a35f','#e9dfd0','#5b8c68','#ad742e','#bd5654','#493a2d','#fff8eb','#c5b5a2','#65513c','#7e664e','#f3ebde','#eee0ca'], dark: ['#1c1814','#2a241d','#362e24','#f5ecdf','#c5b6a4','#d5ad7c','#e4c298','#291e15','#d9c27d','#51443a','#a4cc9e','#e8bf77','#ef9a91','#2c241c','#f7ecdd','#c9b49e','#453629','#654a35','#3a2d21','#604834'] },
  'rose-quartz': { name: 'Rose Quartz', description: 'Muted stone rose with clear, grounded type', light: ['#f8f4f3','#fffefd','#f2e9e8','#372b30','#806f75','#946476','#784f60','#ffffff','#b79783','#e9dada','#518675','#a67737','#b65360','#513a45','#fff7f8','#d2b9c1','#70535f','#8c6875','#f5e9ed','#eedce2'], dark: ['#1d161b','#2b2027','#382a32','#f6edf0','#c4b1b9','#d39cb2','#e6b9c9','#2b2027','#ddbea8','#56424d','#96cbb5','#e4bb78','#f09ba6','#33242e','#f6e9ef','#cdb2be','#513747','#6b495a','#3d2b36','#664554'] },
  lavender: { name: 'Lavender', description: 'Cool lilac light and a contemplative dusk', light: ['#f6f5fa','#fefdff','#edebf5','#302d43','#777189','#685f9d','#514887','#ffffff','#a9a0d5','#dfdbea','#538b79','#aa7a3c','#bf566e','#38354f','#f8f7ff','#b7b1d2','#504b72','#615b84','#efedf8','#e6e2f3'], dark: ['#171622','#222132','#2d2a40','#f1effa','#b9b5ce','#aaa4e7','#c2bcf1','#242237','#bdb5ec','#46435d','#9acdb8','#e0bb7d','#ed98ac','#242237','#f4f1ff','#bbb5d4','#373452','#514b78','#343149','#514b70'] },
  peach: { name: 'Peach', description: 'Bright warmth with terracotta structure', light: ['#fbf6f1','#fffefa','#f7ebe2','#3a2e2a','#856f66','#ad694f','#92533e','#ffffff','#e0ad74','#eadbd1','#56896d','#aa782e','#bd5555','#553b34','#fff8f2','#d5b5a5','#755044','#985f4b','#f8ede5','#f3e0d5'], dark: ['#211814','#30221d','#3e2c25','#f8ede6','#ccb3a5','#e8a78b','#f1bea6','#30211c','#edbe86','#594239','#9dd0a4','#e6bc74','#f09b97','#38251e','#fff0e5','#d5ae9d','#56392c','#754c3b','#422e25','#704a39'] },
});

export const tokenNames = ['canvas','surface','surface-alt','text','muted','primary','primary-hover','primary-text','accent','border','success','warning','danger','sidebar','sidebar-text','sidebar-muted','sidebar-hover','sidebar-selected','hover','selected'];
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
