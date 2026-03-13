/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        aria: {
          primary: 'var(--aria-primary, #6366f1)',
          'primary-dark': 'var(--aria-primary-dark, #4f46e5)',
          bg: 'var(--aria-bg, #0f0f23)',
          'bg-light': 'var(--aria-bg-light, #1a1a3e)',
          surface: 'var(--aria-surface, #252547)',
          text: 'var(--aria-text, #e2e8f0)',
          'text-muted': 'var(--aria-text-muted, #94a3b8)',
          border: 'var(--aria-border, #334155)',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
