import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        adipa: {
          purple:         '#7D61F1',
          'purple-deep':  '#704EFD',
          cyan:           '#72CAF7',
          blue:           '#2CB7FF',
          'bg-light':     '#F3F4FF',
          navy:           '#091E42',
          'blue-light':   '#CBE8FF',
          'purple-light': '#DFD5FF',
        },
      },
      backgroundImage: {
        'adipa-gradient': 'linear-gradient(135deg, #704EFD 0%, #2CB7FF 100%)',
      },
    },
  },
  plugins: [],
}

export default config
