import clsx from 'clsx';
import { APP_NAME } from '@/lib/brand';

/** The app's monogram — the name set on the theme's brand color, so inside
 * the app it follows the company's chosen theme (see src/lib/theme-presets.ts).
 * Size and font size come from `className`. The favicons (src/app/icon.png,
 * apple-icon.png) are this same mark in the default brand red. */
export function BrandMark({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={clsx('flex flex-shrink-0 select-none items-center justify-center rounded-sm2 bg-brand font-extrabold tracking-tight text-white', className)}
    >
      {APP_NAME}
    </span>
  );
}
