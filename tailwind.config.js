/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false }, // CRITICAL: do not reset existing styles.css
  theme: {
    extend: {
      screens: {
        // Mobile-first breakpoints
        'xs': '375px',
        'sm': '430px',
      }
    }
  },
  plugins: [],
}
