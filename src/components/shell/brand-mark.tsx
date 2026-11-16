import Image from 'next/image';
import clsx from 'clsx';
import { APP_NAME } from '@/lib/brand';

/** The platform's mark (public/brand/mark.png) on a white tile — the login
 * screens, the sidebar, the welcome card. Size comes from `className`; the
 * favicons (src/app/icon.png, apple-icon.png) and the PWA icons in
 * public/icons/ are the same mark. */
export function BrandMark({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={clsx('flex flex-shrink-0 select-none items-center justify-center rounded-sm2 bg-white ring-1 ring-black/5', className)}
    >
      <Image src="/brand/mark.png" alt={decorative ? '' : APP_NAME} width={64} height={64} className="h-[70%] w-[70%] object-contain" />
    </span>
  );
}
