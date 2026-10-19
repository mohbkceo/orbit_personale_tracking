import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.js';
import ar from './locales/ar.js';

export const normalizeLanguage = (value, fallback = 'en') => value === 'ar' || value === 'en' ? value : fallback;
export const guestLanguage = () => {
  try { return normalizeLanguage(localStorage.getItem('orbit-guest-language'), 'ar'); }
  catch { return 'ar'; }
};
export const setGuestLanguage = (language) => {
  try { localStorage.setItem('orbit-guest-language', normalizeLanguage(language, 'ar')); }
  catch { /* Storage may be disabled. */ }
};

const resources = { en, ar };
export { resources };
await i18next.use(initReactI18next).init({
  resources,
  lng: guestLanguage(),
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: Object.keys(en),
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
const syncDocument = (language) => {
  if (typeof document === 'undefined' || window.location.pathname.startsWith('/admin')) return;
  document.documentElement.lang = normalizeLanguage(language);
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
};
i18next.on('languageChanged', syncDocument);
syncDocument(i18next.resolvedLanguage);
export default i18next;
