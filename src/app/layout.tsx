import type { Metadata } from 'next';
import { Geist, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { Providers } from '@/components/providers';
import { APP_NAME } from '@/lib/brand';

// Two jobs, two typefaces:
//
// - The app's screens use Geist (`font-sans`, via --font-ui): a compact,
//   modern face that keeps dense screens (tables, forms, the sidebar) tidy at
//   small sizes, with tabular figures for amounts. Checked to include the
//   rupee sign (U+20B9). Onest and Outfit were ruled out: no ₹.
// - Documents (invoices, credit notes, receipts, statements — on screen and
//   in the PDF) stay on IBM Plex Sans via --font-plex-sans. The invoice PDF
//   has measured row limits per page, so its font metrics must not change.
//   globals.css pins it (.invoice-print, .invoice-sheet-mono, .invoice-clean,
//   .print-doc). Plex Mono stays the app's `font-mono`.
//
// 'latin-ext' as well as 'latin': Google's latin subset stops at the euro
// sign — the rupee sign (U+20B9) lives in latin-ext. With only 'latin', a ₹
// fell back to whatever font the machine had, which in the headless PDF
// renderer's minimal Chromium can be none at all (a box on every amount).
const uiSans = Geist({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-ui',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600'],
  variable: '--font-plex-mono',
});

// Applied before hydration so the dark/light class is correct on first
// paint — otherwise the page flashes light before Redux hydrates.
const THEME_INIT_SCRIPT = `
try {
  var theme = localStorage.getItem('arcticblocks_theme');
  if (theme === 'dark') document.documentElement.classList.add('dark');
} catch (e) {}
`;

export const metadata: Metadata = {
  title: `${APP_NAME} — GST billing & invoicing`,
  description: 'GST billing and invoicing for Indian businesses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className={`${uiSans.variable} ${plexSans.variable} ${plexMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
