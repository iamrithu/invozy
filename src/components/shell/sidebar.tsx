'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { sidebarHydrated, toggleSidebar } from '@/lib/redux/ui-slice';
import { BrandMark } from '@/components/shell/brand-mark';
import { APP_NAME } from '@/lib/brand';
import { isNavItemActive, type NavBadge, type NavItem } from '@/lib/nav';
import { useNavBadges, useVisibleNav } from '@/components/shell/use-nav';

// Groups the user folded away, remembered per browser. Read after mount so
// the server render (everything open) and the first client render agree.
const CLOSED_GROUPS_KEY = 'invozy_nav_closed_groups';

const GROUP_LABEL = 'flex items-center justify-between rounded-sm2 px-2.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint';

function loadClosedGroups(): string[] {
  try {
    const raw = localStorage.getItem(CLOSED_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((state) => state.ui.sidebarCollapsed);
  const { groups, settings } = useVisibleNav();
  const badges = useNavBadges();
  const [closed, setClosed] = useState<string[]>([]);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dispatch(sidebarHydrated());
    setClosed(loadClosedGroups());
  }, [dispatch]);

  // The CSS height assumes the sidebar starts right under the 61px top bar.
  // A status banner above the top bar (email to confirm, trial ending)
  // pushes it lower until the page scrolls, which hid the footer (Settings,
  // collapse) on pages too short to scroll. Size it to whatever is visible.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const top = Math.max(el.getBoundingClientRect().top, 0);
      el.style.height = `${Math.max(window.innerHeight - top, 240)}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function toggleGroup(id: string) {
    setClosed((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      try {
        localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  }

  return (
    <aside
      ref={asideRef}
      className={clsx(
        'sticky top-[54px] hidden h-[calc(100vh-54px)] flex-shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 print:hidden md:flex',
        collapsed ? 'w-[60px]' : 'w-[214px]'
      )}
    >
      <nav aria-label="Main" className={clsx('flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain py-3', collapsed ? 'px-2' : 'px-2.5')}>
        {groups.map((group, index) => {
          // The group holding the current page never folds away.
          const hasActive = group.items.some((item) => isNavItemActive(item, pathname));
          const open = collapsed || !group.label || hasActive || !closed.includes(group.id);
          const listId = `nav-group-${group.id}`;
          return (
            <div key={group.id} className={clsx(index > 0 && (collapsed ? 'mt-1' : 'mt-1.5'))}>
              {group.label &&
                (collapsed ? (
                  <div role="separator" className="mx-auto mb-1 mt-1.5 h-px w-6 bg-line" />
                ) : hasActive ? (
                  <div className={GROUP_LABEL}>{group.label}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={open}
                    aria-controls={listId}
                    className={clsx(GROUP_LABEL, 'w-full transition-colors hover:text-ink-soft')}
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={13} className={clsx('transition-transform duration-150', !open && '-rotate-90')} />
                  </button>
                ))}
              {open && (
                <ul id={listId} className="flex flex-col gap-px">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavLink item={item} pathname={pathname} collapsed={collapsed} badges={badges} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className={clsx('flex flex-col gap-2 border-t border-line pb-3 pt-2', collapsed ? 'px-2' : 'px-2.5')}>
        <NavLink item={settings} pathname={pathname} collapsed={collapsed} badges={badges} />
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <div className={clsx('flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap', collapsed && 'hidden')} title={APP_NAME}>
            <BrandMark decorative className="h-6 w-6 text-[8px]" />
            <span className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">{APP_NAME}</span>
          </div>
          <button
            onClick={() => dispatch(toggleSidebar())}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={clsx(
              'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md2 text-ink-faint transition-colors hover:bg-surface-alt hover:text-ink',
              collapsed && 'mx-auto'
            )}
          >
            <ChevronLeft size={15} className={clsx('transition-transform duration-200', collapsed && 'rotate-180')} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, pathname, collapsed, badges }: { item: NavItem; pathname: string | null; collapsed: boolean; badges: Record<NavBadge, number> }) {
  const active = isNavItemActive(item, pathname);
  const count = item.badge ? badges[item.badge] : 0;
  const Icon = item.icon;
  const title = collapsed ? `${item.label}${item.soon ? ' · coming soon' : ''}${count ? ` · ${count}` : ''}` : undefined;
  return (
    <Link
      href={item.href}
      title={title}
      aria-current={active ? 'page' : undefined}
      data-tour={item.tour ? `nav-${item.tour}` : undefined}
      className={clsx(
        'relative flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md2 text-[12.5px] font-medium transition-colors',
        collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[5px]',
        active ? 'bg-brand-light font-semibold text-brand' : item.soon ? 'text-ink-faint hover:bg-surface-alt hover:text-ink-soft' : 'text-ink-soft hover:bg-surface-alt hover:text-ink'
      )}
    >
      <Icon size={15} strokeWidth={active ? 2.3 : 2} className="flex-shrink-0" />
      {!collapsed && <span className="min-w-0 truncate">{item.label}</span>}
      {!collapsed && count > 0 && (
        <span className={clsx('ml-auto min-w-[20px] rounded-sm2 px-1.5 py-px text-center text-[10.5px] font-extrabold tabular-nums text-white', item.badge === 'pendingOrders' ? 'bg-brand' : 'bg-gold')}>{count}</span>
      )}
      {!collapsed && item.soon && (
        <span className="ml-auto rounded-sm2 bg-surface-alt px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-ink-faint">Soon</span>
      )}
      {collapsed && count > 0 && <span aria-hidden className={clsx('absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full', item.badge === 'pendingOrders' ? 'bg-brand' : 'bg-gold')} />}
    </Link>
  );
}
