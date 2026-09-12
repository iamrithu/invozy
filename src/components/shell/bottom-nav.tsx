'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, Package, Users, Receipt, MoreHorizontal, BarChart3, Building2, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const NAV = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
];

const MORE = [
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/company', label: 'Company', icon: Building2 },
];

export function BottomNav() {
  const pathname = usePathname();
  const moreActive = MORE.some((item) => pathname?.startsWith(item.href));

  return (
    <>
      <Link
        href="/invoices/new"
        aria-label="New invoice"
        className="fixed bottom-[calc(60px+14px)] right-4 z-[65] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-brand text-white shadow-btn md:hidden"
      >
        <Plus size={22} />
      </Link>

      <nav
        className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-around border-t border-line bg-surface px-1 py-1.5 md:hidden"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx('flex min-w-[54px] flex-col items-center gap-0.5 rounded-md2 px-1.5 py-1 text-[9.5px] font-bold', active ? 'text-brand' : 'text-ink-faint')}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="More navigation"
              className={clsx('flex min-w-[54px] flex-col items-center gap-0.5 rounded-md2 px-1.5 py-1 text-[9.5px] font-bold', moreActive ? 'text-brand' : 'text-ink-faint')}
            >
              <MoreHorizontal size={19} />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {MORE.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>
                  <item.icon size={14} /> {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}
