/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: 'rgb(var(--color-text) / <alpha-value>)', lime: 'rgb(var(--color-accent) / <alpha-value>)', ...Object.fromEntries(['canvas','surface','surface-alt','text','muted','primary','primary-hover','primary-text','accent','border','success','warning','danger','sidebar','sidebar-text','sidebar-muted','sidebar-hover','sidebar-selected','hover','selected'].map((name) => [name, `rgb(var(--color-${name}) / <alpha-value>)`])) },
      fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui'], display: ['DM Sans', 'ui-sans-serif', 'system-ui'] },
      boxShadow: { soft: '0 12px 34px rgb(var(--color-text) / .07)', lift: '0 18px 50px rgb(var(--color-text) / .12)' },
    },
  },
};
