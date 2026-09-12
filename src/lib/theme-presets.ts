/** Per-company theme colors. Each preset overrides only the three CSS
 * variables (`--brand`, `--brand-dark`, `--brand-light`) the rest of the
 * design system already derives its accent colors from (`--primary`,
 * `--accent`, `--accent-foreground`, `--destructive`, `--ring` in
 * globals.css all resolve via `var(--brand)`) — so picking a preset re-themes
 * the whole app with no changes to any consuming component. Values follow
 * the same saturation/lightness formula as the original red palette in
 * globals.css, just rotated to a new hue, so every preset keeps the same
 * contrast characteristics in both light and dark mode. */

export const THEME_PRESET_KEYS = ['red', 'green', 'blue', 'purple', 'orange', 'teal', 'pink', 'amber'] as const;
export type ThemePresetKey = (typeof THEME_PRESET_KEYS)[number];

type Triplet = { brand: string; brandDark: string; brandLight: string };
type Preset = { label: string; light: Triplet; dark: Triplet };

function fromHue(hue: number): { light: Triplet; dark: Triplet } {
  return {
    light: { brand: `${hue} 75% 55%`, brandDark: `${hue} 73% 46%`, brandLight: `${hue} 63% 94%` },
    dark: { brand: `${hue} 80% 62%`, brandDark: `${hue} 75% 54%`, brandLight: `${hue} 35% 20%` },
  };
}

export const THEME_PRESETS: Record<ThemePresetKey, Preset> = {
  red: { label: 'Red', ...fromHue(355) },
  green: { label: 'Green', ...fromHue(145) },
  blue: { label: 'Blue', ...fromHue(212) },
  purple: { label: 'Purple', ...fromHue(262) },
  orange: { label: 'Orange', ...fromHue(28) },
  teal: { label: 'Teal', ...fromHue(178) },
  pink: { label: 'Pink', ...fromHue(330) },
  amber: { label: 'Amber', ...fromHue(42) },
};

export function isThemePresetKey(value: string): value is ThemePresetKey {
  return (THEME_PRESET_KEYS as readonly string[]).includes(value);
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** A company can also pick any custom color via the color-wheel input in the
 * Branding tab — stored as its raw "#rrggbb" hex instead of a preset key. */
export function isCustomThemeColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

export function isValidThemeColor(value: string): boolean {
  return isThemePresetKey(value) || isCustomThemeColor(value);
}

/** Custom colors keep the same saturation/lightness formula as the presets
 * (see file header) — only the hue comes from the picked color — so an
 * arbitrarily chosen color still gets contrast-safe light/dark variants
 * instead of being used verbatim. */
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return Math.round(h);
}

function resolveTriplets(key: string): { light: Triplet; dark: Triplet } {
  if (isThemePresetKey(key)) return THEME_PRESETS[key];
  if (isCustomThemeColor(key)) return fromHue(hexToHue(key));
  return THEME_PRESETS.red;
}

/** The color a swatch/dot should actually render for a stored theme value —
 * derived the same way the live `<style>` override is, so it never drifts
 * from what the app looks like. */
export function themePreviewColor(key: string): string {
  return `hsl(${resolveTriplets(key).light.brand})`;
}

/** Renders the `<style>` body that overrides the theme CSS variables for one
 * company. Nested under `.dark` for dark mode, same as globals.css itself. */
export function themeStyleTag(key: string): string {
  const { light, dark } = resolveTriplets(key);
  return `:root{--brand:${light.brand};--brand-dark:${light.brandDark};--brand-light:${light.brandLight};}
.dark{--brand:${dark.brand};--brand-dark:${dark.brandDark};--brand-light:${dark.brandLight};}`;
}
