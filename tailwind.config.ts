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
        red: { DEFAULT: 'hsl(var(--red))', soft: 'hsl(var(--red-soft))' },
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
        // IBM Plex Sans/Mono (src/app/layout.tsx) — used app-wide including
        // the printed/PDF invoices (Playwright renders the same page/CSS
        // for those). `mono` now has a real monospace face — every
        // `font-mono`/`.font-tabular` use (amounts, GSTINs, invoice
        // numbers) previously just re-rendered the sans font.
        //
        // Every invoice prints the ₹ symbol on every line item — a wider
        // fallback chain (not just the bare 'system-ui'/'sans-serif'
        // generics) gives the browser more chances to find a real ₹ glyph
        // if IBM Plex Sans's self-hosted font file ever lacks one for a
        // given weight, particularly inside the PDF route's serverless
        // Chromium, which ships its own minimal, self-contained font
        // bundle rather than a full desktop font set.
        sans: ['var(--font-plex-sans)', 'system-ui', 'Noto Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'Noto Sans Mono', 'Consolas', 'monospace'],
      },
      // Boxy with a standard "md" corner (Tailwind's own rounded-md value)
      // everywhere, not the earlier hard 0px / bare 2px. `rounded-full`
      // circles/pills throughout were already replaced with sm2 (see
      // button.tsx, badge.tsx, switch.tsx, etc.), so setting this one scale
      // is enough to apply it app-wide.
      borderRadius: {
        xl2: '6px',
        lg2: '6px',
        md2: '6px',
        sm2: '6px',
        lg: '6px',
        md: '6px',
        sm: '6px',
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
