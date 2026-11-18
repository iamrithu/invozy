import {
  BadgePercent,
  BarChart3,
  Boxes,
  FolderTree,
  History,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
  Route,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  TicketPercent,
  Truck,
  Undo2,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

// The app's navigation, grouped by the job people are doing rather than by
// database table. One list feeds the desktop sidebar, the phone "More" sheet
// and the ⌘K palette, so the three never drift apart.
//
// Visibility rules, applied by each consumer:
// - an item whose path belongs to a switched-off module (src/lib/modules.ts)
//   is hidden — modules.pathEnabled(href);
// - `ownerOnly` items are hidden from staff (the page checks again);
// - `soon` items are planned features: the route renders a Coming soon page
//   (src/components/shell/coming-soon.tsx, copy in src/lib/coming-soon.ts).

export type NavBadge = 'lowStock' | 'pendingOrders';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Planned, not built yet: the route shows a Coming soon page. */
  soon?: boolean;
  ownerOnly?: boolean;
  /** Other paths that keep this item highlighted. */
  also?: string[];
  badge?: NavBadge;
  /** Onboarding tour anchors (src/components/onboarding/onboarding-tour.tsx). */
  tour?: string;
};

export type NavGroup = { id: string; label?: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { id: 'home', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, tour: 'dashboard' }] },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { href: '/orders', label: 'Orders', icon: ShoppingBag, badge: 'pendingOrders' },
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/payments', label: 'Payments', icon: Wallet },
      { href: '/credit-notes', label: 'Returns', icon: Undo2 },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { href: '/customers', label: 'Customers', icon: Users, tour: 'customers' },
      { href: '/customer-groups', label: 'Customer groups', icon: UsersRound },
      { href: '/delivery-routes', label: 'Delivery routes', icon: Route },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { href: '/products', label: 'Products', icon: Package, tour: 'products' },
      { href: '/categories', label: 'Categories', icon: FolderTree },
      { href: '/price-lists', label: 'Price lists', icon: Tags },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      { href: '/inventory', label: 'Stock', icon: Boxes, badge: 'lowStock' },
      { href: '/purchases', label: 'Purchases', icon: ShoppingCart },
      { href: '/suppliers', label: 'Suppliers', icon: Truck },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    items: [
      { href: '/coupons', label: 'Coupons', icon: TicketPercent },
      { href: '/discounts', label: 'Discounts', icon: BadgePercent },
    ],
  },
  {
    id: 'store',
    label: 'Online store',
    items: [
      { href: '/storefront', label: 'Storefront', icon: Store },
      { href: '/delivery-zones', label: 'Delivery zones', icon: MapPin },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/activity', label: 'Activity log', icon: History, ownerOnly: true },
    ],
  },
];

/** Pinned under the groups. Company, Team, Billing and Account stay at their
 * own URLs for now; Settings is the hub that links to them. */
export const NAV_SETTINGS: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  also: ['/company', '/team', '/billing', '/account'],
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), NAV_SETTINGS];

/** True when `pathname` is on this item's page or one of its sub-pages. */
export function isNavItemActive(item: NavItem, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return [item.href, ...(item.also ?? [])].some((href) => pathname === href || pathname.startsWith(`${href}/`));
}

export function navItemFor(href: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => item.href === href);
}

export function navGroupFor(href: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((item) => item.href === href));
}
