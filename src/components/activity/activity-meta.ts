import { Boxes, Building2, Factory, FileMinus, Package, Receipt, Truck, UserCog, Users, Wallet, Activity, type LucideIcon } from 'lucide-react';

/** Display helpers shared by the Activity log screen and ActivityTimeline —
 * one place that knows how each logged entity type looks and where it
 * lives in the app, and how to print a log time in IST. */

type EntityMeta = { label: string; icon: LucideIcon; list: string; detail?: (id: string) => string };

const ENTITY_META: Record<string, EntityMeta> = {
  invoice: { label: 'Invoice', icon: Receipt, list: '/invoices', detail: (id) => `/invoices/${id}` },
  // Payments are logged against the invoice they pay (entityId = invoice id).
  payment: { label: 'Payment', icon: Wallet, list: '/invoices', detail: (id) => `/invoices/${id}` },
  customer: { label: 'Customer', icon: Users, list: '/customers', detail: (id) => `/customers?open=${encodeURIComponent(id)}` },
  product: { label: 'Product', icon: Package, list: '/products' },
  // Stock rows are logged against the product they count (entityId = product id).
  stock: { label: 'Stock', icon: Boxes, list: '/inventory', detail: (id) => `/inventory/${id}` },
  purchase: { label: 'Purchase', icon: Truck, list: '/purchases', detail: (id) => `/purchases/${id}` },
  'credit-note': { label: 'Credit note', icon: FileMinus, list: '/credit-notes', detail: (id) => `/credit-notes/${id}` },
  supplier: { label: 'Supplier', icon: Factory, list: '/suppliers' },
  company: { label: 'Company', icon: Building2, list: '/company' },
  user: { label: 'Login', icon: UserCog, list: '/team' },
};

const FALLBACK: EntityMeta = { label: 'Activity', icon: Activity, list: '/activity' };

export function entityMeta(entityType: string): EntityMeta {
  return ENTITY_META[entityType] ?? FALLBACK;
}

/** Where a log row should take you: the record itself, or nothing when this
 * row is that record's own deletion (`invoice.delete`, `supplier.deleted`)
 * — its page would just 404. Deleting something *on* a record
 * (`payment.delete` against an invoice, `product.offer.delete`) still links,
 * since the record is still there. */
export function activityHref(row: { entityType: string; entityId: string | null; action: string }): string | null {
  if (new RegExp(`^${row.entityType.replace(/[^a-z-]/gi, '')}\\.delete(d)?$`, 'i').test(row.action)) return null;
  const meta = ENTITY_META[row.entityType];
  if (!meta) return null;
  return row.entityId && meta.detail ? meta.detail(row.entityId) : meta.list;
}

// India has no DST, so a fixed Asia/Kolkata zone is exact — and makes the
// output identical whether this runs on a UTC server or a phone abroad.
const TIME_IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
const DATE_IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const DAY_HEADING_IST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const DAY_HEADING_IST_YEAR = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2:45 pm" */
export function formatTimeIst(iso: string): string {
  return TIME_IST.format(new Date(iso));
}

/** "31 Oct 2026, 2:45 pm" */
export function formatDateTimeIst(iso: string): string {
  const d = new Date(iso);
  return `${DATE_IST.format(d)}, ${TIME_IST.format(d)}`;
}

/** "just now", "5 min ago", "3 hr ago", "yesterday", "4 days ago" — or
 * null once it's over a week old, where the plain date reads better. */
export function formatRelative(iso: string, now = Date.now()): string | null {
  const diffMin = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = daysBetween(istDayKey(iso), istDayKey(new Date(now).toISOString()));
  if (diffDays <= 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return null;
}

/** The IST calendar day an instant falls on, as `YYYY-MM-DD`. */
export function istDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000);
}

/** Group heading for one IST day: "Today", "Yesterday", "Mon, 28 Oct"
 * (with the year once it's not this year). */
export function dayHeading(dayKey: string, now = Date.now()): string {
  const todayKey = istDayKey(new Date(now).toISOString());
  const diff = daysBetween(dayKey, todayKey);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  // Noon IST on that day — safely inside it whatever the formatter rounds.
  const noon = new Date(`${dayKey}T12:00:00+05:30`);
  return (dayKey.slice(0, 4) === todayKey.slice(0, 4) ? DAY_HEADING_IST : DAY_HEADING_IST_YEAR).format(noon);
}

/** Splits newest-first rows into consecutive IST-day groups. */
export function groupByIstDay<T extends { createdAt: string }>(rows: T[]): { dayKey: string; rows: T[] }[] {
  const groups: { dayKey: string; rows: T[] }[] = [];
  for (const row of rows) {
    const key = istDayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.dayKey === key) last.rows.push(row);
    else groups.push({ dayKey: key, rows: [row] });
  }
  return groups;
}
