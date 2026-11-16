'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Building2, ScrollText } from 'lucide-react';

const ITEMS = [
  { href: '/admin', label: 'Companies', icon: Building2, match: (p: string) => p === '/admin' || p.startsWith('/admin/companies') },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText, match: (p: string) => p.startsWith('/admin/audit') },
];

export function AdminNav() {
  const pathname = usePathname() ?? '';
  return (
    <>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={clsx(
            'flex items-center gap-2.5 rounded-md2 px-3 py-2.5 text-[13px] font-bold',
            item.match(pathname) ? 'bg-brand-light text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
          )}
        >
          <item.icon size={16} /> {item.label}
        </Link>
      ))}
    </>
  );
}
