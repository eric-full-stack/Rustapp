/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        rust: {
          50: '#fef3e2',
          100: '#fde4b9',
          200: '#fcd38c',
          300: '#fbc25f',
          400: '#fab53d',
          500: '#f9a825',
          600: '#f57f17',
          700: '#e65100',
          800: '#bf360c',
          900: '#8b1a00',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      safe: [{ pattern: /safe-area/ }],
    },
  },
  plugins: [],
};
