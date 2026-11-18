'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/actions/notifications';
import { usePendingOrderCount } from '@/hooks/use-orders';
import { useCurrentUser } from '@/components/current-user';
import { useModules } from '@/components/modules/modules-provider';
import { NAV_GROUPS, NAV_SETTINGS, type NavBadge, type NavGroup, type NavItem } from '@/lib/nav';

/** The navigation this login may see: items of switched-off modules and
 * owner-only items (for staff) are dropped, then empty groups. */
export function useVisibleNav(): { groups: NavGroup[]; settings: NavItem } {
  const modules = useModules();
  const me = useCurrentUser();
  return useMemo(() => {
    const visible = (item: NavItem) => modules.pathEnabled(item.href) && (!item.ownerOnly || me.isOwner);
    const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length > 0);
    return { groups, settings: NAV_SETTINGS };
  }, [modules, me.isOwner]);
}

/** Counts that need action, shown as nav badges: web orders waiting for
 * confirmation, and low stock (from the notifications bell's own query, so
 * no extra request). */
export function useNavBadges(): Record<NavBadge, number> {
  const modules = useModules();
  const inventoryOn = modules.enabled('inventory');
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => getNotifications(),
    staleTime: 30_000,
    enabled: inventoryOn,
  });
  const stock = inventoryOn ? data?.items.find((n) => n.id === 'stock') : undefined;
  const { data: pending = 0 } = usePendingOrderCount();
  return { lowStock: stock ? stock.count ?? stock.entries.length : 0, pendingOrders: pending };
}
