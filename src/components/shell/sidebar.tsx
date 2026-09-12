'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, Package, Users, Receipt, BarChart3, Building2, ChevronLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { sidebarHydrated, toggleSidebar } from '@/lib/redux/ui-slice';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/company', label: 'Company', icon: Building2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);

  useEffect(() => {
    dispatch(sidebarHydrated());
  }, [dispatch]);

  return (
    <aside
      className={clsx(
        'sticky top-[61px] hidden h-[calc(100vh-61px)] flex-shrink-0 flex-col border-r border-line bg-surface transition-[width,padding] duration-200 md:flex',
        collapsed ? 'w-[60px] px-2 py-4' : 'w-[216px] px-3 py-4'
      )}
    >
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={clsx(
                'flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-md2 px-3 py-2.5 text-[13px] font-bold transition-colors',
                collapsed && 'justify-center px-2',
                active ? 'bg-brand-light text-brand' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
              )}
            >
              <Icon size={17} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-2 flex flex-col gap-2.5 border-t border-line pt-3">
        <div className={clsx('flex items-center gap-2 overflow-hidden whitespace-nowrap px-1', collapsed && 'justify-center px-0')} title="Invozy">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 bg-white ring-1 ring-black/5">
            <Image src="/brand/mark.png" alt="" width={64} height={64} className="h-4 w-4 object-contain" />
          </span>
          {!collapsed && <span className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Invozy</span>}
        </div>
        <button
          onClick={() => dispatch(toggleSidebar())}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap text-[11.5px] font-bold text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft size={14} className={clsx('flex-shrink-0 transition-transform duration-200', collapsed && 'rotate-180')} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
