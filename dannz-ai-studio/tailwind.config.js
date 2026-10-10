/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens map to CSS variables defined in globals.css so the
        // same component classes work in dark and light themes, including
        // opacity modifiers (e.g. bg-bg-secondary/70).
        bg: {
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          border: 'rgb(var(--border) / <alpha-value>)',
        },
        accent: {
          primary: 'rgb(var(--accent) / <alpha-value>)',
          hover: 'rgb(var(--accent-hover) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        error: 'rgb(var(--error) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Oswald', 'Bebas Neue', 'Impact', 'system-ui', 'sans-serif'],
        ui: ['Oswald', 'Barlow Condensed', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'rise-in': 'riseIn 0.55s cubic-bezier(0.33, 0.9, 0.35, 1) forwards',
        'line-in': 'lineIn 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'mark-in': 'markIn 0.7s cubic-bezier(0.2, 0.9, 0.25, 1) forwards',
        'block-in-l': 'blockInL 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'block-in-r': 'blockInR 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan': 'scan 2s linear infinite',
        'spin-slow': 'spin 2.4s linear infinite',
      },
      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        lineIn: {
          '0%': { opacity: '0', transform: 'translateY(0.26em)', clipPath: 'inset(100% -30% 0% -30%)' },
          '35%': { opacity: '1' },
          '90%': { clipPath: 'inset(0% -30% -100% -30%)' },
          '100%': { opacity: '1', transform: 'none', clipPath: 'inset(-80% -30% -100% -30%)' },
        },
        markIn: {
          '0%': { opacity: '0', transform: 'scale(0.88)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        blockInL: {
          '0%': { opacity: '0', transform: 'translate(-12px, 8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        blockInR: {
          '0%': { opacity: '0', transform: 'translate(12px, 8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      boxShadow: {
        'glow': '0 0 20px rgba(214, 82, 58, 0.3), 0 0 40px rgba(214, 82, 58, 0.1)',
        'glow-sm': '0 0 10px rgba(214, 82, 58, 0.2)',
        'inner-glow': 'inset 0 0 20px rgba(214, 82, 58, 0.1)',
        'card': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.03)',
      },
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
