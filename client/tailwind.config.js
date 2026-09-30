import { tokenNames } from './src/appearance/themes.js';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(tokenNames.map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`])),
      fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui'], display: ['DM Sans', 'ui-sans-serif', 'system-ui'] },
      boxShadow: { lift: '0 18px 50px rgb(var(--color-text) / .16)' },
    },
  },
};
