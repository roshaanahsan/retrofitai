/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zinc: {
          950: '#09090B',
          900: '#18181B',
          800: '#27272A',
          700: '#3F3F46',
          500: '#71717A',
          400: '#A1A1AA',
          300: '#D4D4D8',
          50: '#FAFAFA',
        },
        indigo: {
          950: '#1E1B4B',
          700: '#4338CA',
          600: '#4F46E5',
          500: '#6366F1',
          300: '#A5B4FC',
          200: '#C7D2FE',
        },
        emerald: {
          950: '#022C22',
          500: '#10B981',
          400: '#34D399',
        },
        amber: {
          950: '#1C1400',
          500: '#F59E0B',
          400: '#FBBF24',
        },
        red: {
          900: '#450A0A',
          500: '#EF4444',
          400: '#F87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      fontSize: {
        '2xs': '11px',
        xs: '12px',
        sm: '13px',
        base: '14px',
        md: '16px',
        lg: '20px',
        xl: '28px',
      },
      borderRadius: {
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
