'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, Menu, Package, Receipt, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { isNavItemActive, type NavItem } from '@/lib/nav';
import { useNavBadges, useVisibleNav } from '@/components/shell/use-nav';

// Four slots plus More is all a phone's width takes. The four are the daily
// screens; More opens every group from the sidebar (src/lib/nav.ts).
// Customers and Products keep their data-tour anchors for the onboarding tour.
const PRIMARY = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, tour: 'mobile-nav-dashboard' },
  { href: '/invoices', label: 'Invoices', icon: Receipt },
  { href: '/customers', label: 'Customers', icon: Users, tour: 'mobile-nav-customers' },
  { href: '/products', label: 'Products', icon: Package, tour: 'mobile-nav-products' },
];

const isPrimary = (pathname: string | null) => PRIMARY.some((item) => pathname === item.href || pathname?.startsWith(`${item.href}/`));

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { groups, settings } = useVisibleNav();
  const badges = useNavBadges();
  const moreActive = !!pathname && !isPrimary(pathname);
  const moreCount = badges.lowStock + badges.pendingOrders;

  const close = () => setOpen(false);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-around border-t border-line bg-surface px-1 py-1.5 print:hidden md:hidden"
        style={{ paddingBottom: 'calc(0.375rem + env(safe-area-inset-bottom))' }}
      >
        {PRIMARY.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.tour}
              aria-current={active ? 'page' : undefined}
              className={clsx('flex min-w-[54px] flex-col items-center gap-0.5 rounded-md2 px-1.5 py-1 text-[10px] font-bold', active ? 'text-brand' : 'text-ink-faint')}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="All sections"
          aria-haspopup="dialog"
          className={clsx('relative flex min-w-[54px] flex-col items-center gap-0.5 rounded-md2 px-1.5 py-1 text-[10px] font-bold', moreActive ? 'text-brand' : 'text-ink-faint')}
        >
          <Menu size={19} />
          <span>More</span>
          {moreCount > 0 && <span aria-hidden className="absolute right-3 top-0.5 h-2 w-2 rounded-full bg-gold ring-2 ring-surface" />}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="md:hidden">
          <div className="border-b border-line px-5 pb-3 pt-5">
            <SheetTitle>All sections</SheetTitle>
            <SheetDescription>Everything in the sidebar, grouped by job.</SheetDescription>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-8 pt-2" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
            {groups.map((group) => (
              <section key={group.id} className="mt-3">
                {group.label && <h2 className="px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-faint">{group.label}</h2>}
                <ul className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <SheetLink item={item} pathname={pathname} count={item.badge ? badges[item.badge] : 0} onNavigate={close} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <section className="mt-4 border-t border-line pt-3">
              <SheetLink item={settings} pathname={pathname} count={0} onNavigate={close} />
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SheetLink({ item, pathname, count, onNavigate }: { item: NavItem; pathname: string | null; count: number; onNavigate: () => void }) {
  const active = isNavItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex min-h-[44px] items-center gap-2.5 rounded-md2 border px-3 py-2 text-[13px] font-semibold',
        active ? 'border-brand/30 bg-brand-light text-brand' : 'border-line bg-surface text-ink-soft active:bg-surface-alt'
      )}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block leading-tight">{item.label}</span>
        {item.soon && <span className="mt-0.5 block text-[9.5px] font-bold uppercase tracking-wider text-ink-faint">Coming soon</span>}
      </span>
      {count > 0 && <span className="rounded-sm2 bg-gold px-1.5 text-[10.5px] font-extrabold tabular-nums text-white">{count}</span>}
    </Link>
  );
}
