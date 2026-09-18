import type { Config } from 'tailwindcss';

// Design tokens carried over 1:1 from the validated HTML/CSS prototype.
// Colors are Zomato's documented brand values (not eyeballed) — see
// frontend-documentation.md §3 for the source. Keep this file as the
// single place a re-theme happens, exactly like the prototype's :root block.
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Brand + surface tokens are CSS-variable-driven (see globals.css'
        // :root vs .dark blocks) so the whole app repaints for dark mode
        // without every component needing its own dark: variant.
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          dark: 'hsl(var(--brand-dark))',
          light: 'hsl(var(--brand-light))',
        },
        gold: { DEFAULT: 'hsl(var(--gold))', soft: 'hsl(var(--gold-soft))' },
        green: { DEFAULT: 'hsl(var(--green))', soft: 'hsl(var(--green-soft))' },
        ink: {
          DEFAULT: 'hsl(var(--ink))',
          body: 'hsl(var(--ink-body))',
          soft: 'hsl(var(--ink-soft))',
          faint: 'hsl(var(--ink-faint))',
        },
        surface: { DEFAULT: 'hsl(var(--surface))', alt: 'hsl(var(--surface-alt))' },
        bg: 'hsl(var(--bg))',
        line: 'hsl(var(--line))',
        // Fixed near-black, deliberately theme-independent (see globals.css).
        chrome: 'hsl(var(--chrome))',
        // shadcn/ui semantic tokens — driven by the CSS variables in
        // globals.css, which are the same brand palette above expressed as HSL.
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
        mono: ['"Times New Roman"', 'Times', 'Georgia', 'serif'],
      },
      // Times New Roman only ships true Regular/Bold masters — the
      // in-between weights (medium/semibold/extrabold/black) used
      // throughout the app for headers/labels would otherwise render as
      // browser-synthesized "fake bold" or just fall back to Regular,
      // which is exactly the "too light" look this maps everything at or
      // above medium straight to real Bold to avoid.
      fontWeight: {
        thin: '400',
        extralight: '400',
        light: '400',
        normal: '400',
        medium: '700',
        semibold: '700',
        bold: '700',
        extrabold: '700',
        black: '700',
      },
      borderRadius: {
        xl2: '16px',
        lg2: '13px',
        md2: '10px',
        sm2: '8px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,28,28,.06), 0 1px 6px rgba(28,28,28,.05)',
        elevated: '0 10px 26px -8px rgba(28,28,28,.2)',
        // Neutral (never tinted by the active theme color) — used for
        // primary/CTA buttons so their shadow reads as "natural depth"
        // rather than a colored glow, and stays correct across every
        // per-company theme preset (see src/lib/theme-presets.ts).
        btn: '0 6px 16px -6px rgba(20,20,20,.35)',
        // Decorative brand-tinted glow — logo badges, avatars — not buttons.
        brand: '0 8px 20px -6px rgba(226,55,68,.4)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
export default config;
