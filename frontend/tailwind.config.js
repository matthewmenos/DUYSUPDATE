/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /*
         * Semantic palette driven by CSS variables (see src/index.css).
         * DUYS brand: black & blue. Dark theme is the default; a `light`
         * class on <html> flips the variable values, so every hardcoded
         * `bg-black`, `text-white`, `bg-gray-*` utility across the app
         * automatically becomes theme-aware.
         * Colors are stored as RGB triplets so Tailwind alpha modifiers
         * (e.g. bg-black/70) keep working.
         */
        black: 'rgb(var(--c-bg) / <alpha-value>)',
        white: 'rgb(var(--c-text) / <alpha-value>)',
        gray: {
          300: 'rgb(var(--c-gray-300) / <alpha-value>)',
          400: 'rgb(var(--c-gray-400) / <alpha-value>)',
          500: 'rgb(var(--c-gray-500) / <alpha-value>)',
          600: 'rgb(var(--c-gray-600) / <alpha-value>)',
          700: 'rgb(var(--c-gray-700) / <alpha-value>)',
          800: 'rgb(var(--c-gray-800) / <alpha-value>)',
          900: 'rgb(var(--c-gray-900) / <alpha-value>)',
        },
        // DUYS brand blue
        brand: {
          300: '#7cb0fb',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
      },
      fontSize: {
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
      }
    },
  },
  plugins: [],
}
