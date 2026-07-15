/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E3A5F',
          light: '#2B5A8C',
          dark: '#15294A',
        },
        accent: {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
        },
        surface: {
          DEFAULT: '#F0F4F8',
          card: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#1A202C',
          secondary: '#64748B',
        },
        border: {
          DEFAULT: '#E2E8F0',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      borderRadius: {
        xl2: '16px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-lg': '0 10px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
