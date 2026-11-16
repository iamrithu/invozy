'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { LayoutDashboard, Package, Users, Receipt, MoreHorizontal, BarChart3, Building2, Boxes, ShoppingCart } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useModules } from '@/components/modules/modules-provider';

// Same order as the sidebar. Four slots plus More is all a phone's width
// takes, so stock and purchases sit under More; Products stays in the bar
// because the onboarding tour points at it (data-tour).
const NAV = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, tour: 'mobile-nav-dashboard' },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users, tour: 'mobile-nav-customers' },
  { href: '/products', label: 'Products', icon: Package, tour: 'mobile-nav-products' },
];

const MORE = [
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/company', label: 'Company', icon: Building2 },
];

export function BottomNav() {
  const pathname = usePathname();
  const modules = useModules();
  const more = MORE.filter((item) => modules.pathEnabled(item.href));
  // Suppliers is reached from Purchases, so it lights up More too.
  const moreActive = [...more.map((item) => item.href), '/suppliers'].some((href) => pathname?.startsWith(href));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-around border-t border-line bg-surface px-1 py-1.5 print:hidden md:hidden"
      style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
    >
      {NAV.map((item) => {
        const active = pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={item.tour}
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
          {more.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <item.icon size={14} /> {item.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
