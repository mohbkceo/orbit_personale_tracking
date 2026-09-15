/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#15211c', canvas: '#f6f7f2', accent: '#1f6f54', lime: '#d7ef72' },
      fontFamily: { sans: ['Manrope', 'ui-sans-serif', 'system-ui'], display: ['DM Sans', 'ui-sans-serif', 'system-ui'] },
      boxShadow: { soft: '0 12px 34px rgba(20, 34, 27, .07)', lift: '0 18px 50px rgba(20, 34, 27, .12)' },
    },
  },
};
