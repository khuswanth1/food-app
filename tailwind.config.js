/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#fff4ef', 100: '#ffe5d9', 200: '#ffc6ad', 300: '#ff9d75', 400: '#fb7046',
          500: '#f04f23', 600: '#d93a12', 700: '#b42c10', 800: '#8f2614', 900: '#742314',
        },
        ink: { 950: '#0b0d12', 900: '#12151c', 800: '#1a1e27', 700: '#262b36', 600: '#3a4150' },
      },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.06)' },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
};
