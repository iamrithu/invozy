import type { CSSProperties } from 'react';

/** The invoice sheet (builder preview, print view, and the read-only
 * /invoices/[id] page) represents a printed paper document — it must always
 * render light, regardless of the app's light/dark theme, the same way a
 * physical printout doesn't go dark just because your OS does. These are
 * the app's own light-mode token values (see globals.css :root), applied as
 * a local CSS custom-property override so every existing `text-ink`,
 * `border-line`, `bg-surface-alt`, etc. class inside the wrapped subtree
 * resolves to a fixed light color instead of following `.dark`. */
export const PAPER_STYLE: CSSProperties = {
  ['--bg' as any]: '0 0% 97%',
  ['--surface' as any]: '0 0% 100%',
  ['--surface-alt' as any]: '0 0% 94%',
  ['--line' as any]: '0 0% 92%',
  ['--ink' as any]: '0 0% 11%',
  ['--ink-body' as any]: '231 14% 28%',
  ['--ink-soft' as any]: '229 7% 45%',
  ['--ink-faint' as any]: '0 0% 61%',
  ['--brand' as any]: '355 75% 55%',
  ['--brand-dark' as any]: '355 73% 46%',
  ['--brand-light' as any]: '354 63% 94%',
  ['--gold' as any]: '40 86% 52%',
  ['--gold-soft' as any]: '42 89% 93%',
  ['--green' as any]: '134 52% 47%',
  ['--green-soft' as any]: '140 52% 94%',
};
