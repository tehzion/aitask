/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        canvas: 'rgb(var(--calm-canvas) / <alpha-value>)',
        surface: 'rgb(var(--calm-surface) / <alpha-value>)',
        inset: 'rgb(var(--calm-inset) / <alpha-value>)',
        ink: 'rgb(var(--calm-ink) / <alpha-value>)',
        muted: 'rgb(var(--calm-muted) / <alpha-value>)',
        line: 'rgb(var(--calm-line) / <alpha-value>)',
        accent: 'rgb(var(--calm-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--calm-accent-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Geist Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono Variable', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        panel: '0.875rem',
        control: '0.5rem',
        tag: '0.375rem',
      },
      boxShadow: {
        calm: '0 18px 50px -30px rgb(7 22 18 / 0.32)',
        float: '0 18px 42px -24px rgb(7 22 18 / 0.46)',
      },
      transitionDuration: {
        160: '160ms',
      },
      maxWidth: {
        workspace: '100rem',
      },
    },
  },
  plugins: [],
};
