/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // WhatsApp-teal brand family — unified on #00a884 so every
        // `bg-primary-*` / `text-primary-*` / `border-primary-*` / etc.
        // Tailwind utility paints the same hue as the --hai-primary-*
        // token scale in src/app/design-tokens.css.
        primary: {
          50:  '#e0f7f2',
          100: '#b3ebdc',
          200: '#80dec4',
          300: '#00a884',   // collapsed — brand green only
          400: '#00a884',
          500: '#00a884',   // THE green — single hue
          600: '#008f72',   // hover / pressed (darker)
          700: '#006d57',
          800: '#005745',
          900: '#004d3e',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        arabic: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
        brand: ['IBM Plex Sans Arabic', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
