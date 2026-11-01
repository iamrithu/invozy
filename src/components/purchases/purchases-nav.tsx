'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/purchases', label: 'Purchases' },
  { href: '/suppliers', label: 'Suppliers' },
];

/** The Purchases ⇄ Suppliers switch at the top of both screens — suppliers
 * only matter for buying, so they live beside purchases rather than in the
 * main navigation. */
export function PurchasesNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Purchases sections" className={cn('inline-flex rounded-sm2 bg-surface-alt p-1', className)}>
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn('rounded-sm2 px-3 py-1 text-[12.5px] font-bold transition-colors', active ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink')}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
