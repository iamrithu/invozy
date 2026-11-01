import { prisma } from '@/lib/prisma';
import { istDayRangeUtc } from '@/lib/dates';
import { formatStock, round6 } from '@/lib/stock-units';
import { customerDisplayName } from '@/lib/customer';
import { loadProductMeta, mainQtyOf } from '../report-data';

// The daily loading sheet: what goes on each vehicle (or each route) for one
// day's invoices, and the order the drops happen in. Read by the on-screen
// page (through the getLoadingSheet server action, which checks the
// session) and by the headless-PDF print page (which checks a signed
// token instead) — so this loader itself does no auth and must never be
// exported from a 'use server' file.

export type LoadingGroupBy = 'vehicle' | 'route';

export type LoadingSheetParams = { date: string; group: LoadingGroupBy; includeDrafts: boolean };

export type LoadItem = {
  key: string;
  name: string;
  category: string;
  /** Main units (fractional = loose pieces); for ad-hoc lines, their own unit. */
  qty: number;
  /** The unit `qty` is in — the product's main unit, or an ad-hoc line's own. */
  unit: string;
  /** "4 Box + 6 Pc" — ready to print. */
  label: string;
  adhoc: boolean;
};

export type DropRow = {
  invoiceId: string;
  customerId: string;
  number: string;
  status: string;
  customer: string;
  /** The personal name when the shop name is what `customer` shows. */
  contactName: string | null;
  address: string | null;
  phone: string | null;
  route: string | null;
  amount: number;
  toCollect: number;
  note: string | null;
};

export type LoadingTotals = { invoices: number; shops: number; value: number; toCollect: number; mainQty: number };

export type LoadingGroup = {
  key: string;
  label: string;
  /** True for the "No vehicle" / "No route" bucket. */
  unassigned: boolean;
  driver: string | null;
  totals: LoadingTotals;
  /** "34 Box" / "34 Box + 5 Pack" headline for the group's load, see loadSummary. */
  loadLabel: string;
  load: LoadItem[];
  drops: DropRow[];
};

export type LoadingSheet = LoadingSheetParams & {
  totals: LoadingTotals;
  loadLabel: string;
  groups: LoadingGroup[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerces untrusted query/action input into valid params — anything
 * malformed falls back to `today` / vehicle / no drafts. */
export function normalizeLoadingParams(input: { date?: string | null; group?: string | null; drafts?: string | boolean | null }, today: string): LoadingSheetParams {
  const date = input.date && DATE.test(input.date) && !Number.isNaN(Date.parse(input.date)) ? input.date : today;
  const group: LoadingGroupBy = input.group === 'route' ? 'route' : 'vehicle';
  const includeDrafts = input.drafts === true || input.drafts === '1' || input.drafts === 'true';
  return { date, group, includeDrafts };
}

/** What a print token for this sheet is minted for — binds the token to
 * one date/grouping, so a link for today can't be edited into another day. */
export function loadingSheetTokenId(p: LoadingSheetParams): string {
  return `${p.date}|${p.group}|${p.includeDrafts ? 1 : 0}`;
}

export function loadingSheetQuery(p: LoadingSheetParams): string {
  const q = new URLSearchParams({ date: p.date, group: p.group });
  if (p.includeDrafts) q.set('drafts', '1');
  return q.toString();
}

function vehicleKey(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

const collator = new Intl.Collator('en-IN', { sensitivity: 'base', numeric: true });

/** The whole load in one line, per main unit — "86.5 Box", or
 * "34 Box + 5 Pack" when products count in different units (half a box of
 * one product isn't the same number of pieces as half of another, so
 * fractions stay as boxes here; the per-product list has the pieces).
 * Ad-hoc lines are left out — they're listed by name. */
function loadSummary(items: LoadItem[]): string {
  const byUnit = new Map<string, { unit: string; qty: number }>();
  for (const i of items) {
    if (i.adhoc) continue;
    const k = i.unit.trim().toLowerCase();
    const e = byUnit.get(k) ?? { unit: i.unit.trim(), qty: 0 };
    e.qty = round6(e.qty + i.qty);
    byUnit.set(k, e);
  }
  const parts = [...byUnit.values()].filter((e) => e.qty > 0).sort((a, b) => b.qty - a.qty);
  return parts.length ? parts.map((e) => `${Math.round(e.qty * 10) / 10} ${e.unit}`).join(' + ') : '—';
}

export async function loadLoadingSheet(params: LoadingSheetParams): Promise<LoadingSheet> {
  const { gte, lt } = istDayRangeUtc(params.date);
  const invoices = await prisma.invoice.findMany({
    where: {
      date: { gte, lt },
      ...(params.includeDrafts ? {} : { status: { in: ['SENT', 'PARTIALLY_PAID', 'PAID'] } }),
    },
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      amountPaid: true,
      transportVehicleNo: true,
      transportDriverName: true,
      vehicleNo: true,
      deliveryInstructions: true,
      customer: { select: { id: true, name: true, shopName: true, phone: true, address: true, district: true, route: true } },
      items: { select: { productId: true, name: true, unit: true, qty: true, stockQty: true } },
    },
  });

  const productIds = [...new Set(invoices.flatMap((inv) => inv.items.map((it) => it.productId).filter((id): id is string => !!id)))];
  const products = await loadProductMeta(productIds);

  type Bucket = { key: string; label: string; unassigned: boolean; drivers: Set<string>; invoices: typeof invoices };
  const buckets = new Map<string, Bucket>();
  for (const inv of invoices) {
    let key: string;
    let label: string;
    if (params.group === 'vehicle') {
      key = vehicleKey(inv.transportVehicleNo || inv.vehicleNo);
      label = key || 'No vehicle';
    } else {
      const route = (inv.customer.route ?? '').replace(/\s+/g, ' ').trim();
      key = route.toLowerCase();
      label = route || 'No route';
    }
    let b = buckets.get(key);
    if (!b) {
      b = { key: key || '__none__', label, unassigned: !key, drivers: new Set(), invoices: [] };
      buckets.set(key, b);
    }
    if (inv.transportDriverName?.trim()) b.drivers.add(inv.transportDriverName.trim());
    b.invoices.push(inv);
  }

  const dayItems: LoadItem[] = [];

  const groups: LoadingGroup[] = [...buckets.values()].map((b) => {
    // Load list — Σ main-unit qty per product; ad-hoc lines by name + unit.
    const load = new Map<string, LoadItem>();
    for (const inv of b.invoices) {
      for (const it of inv.items) {
        const qty = Number(it.qty);
        const p = it.productId ? products.get(it.productId) : undefined;
        if (p) {
          const main = mainQtyOf({ qty, unit: it.unit, stockQty: it.stockQty == null ? null : Number(it.stockQty) }, p);
          const row = load.get(p.id) ?? { key: p.id, name: p.name, category: p.category, qty: 0, unit: p.unit, label: '', adhoc: false };
          row.qty = round6(row.qty + main);
          load.set(p.id, row);
        } else {
          const key = `adhoc:${it.name.trim().toLowerCase()}|${it.unit.trim().toLowerCase()}`;
          const row = load.get(key) ?? { key, name: it.name.trim(), category: '', qty: 0, unit: it.unit.trim(), label: '', adhoc: true };
          row.qty = round6(row.qty + qty);
          load.set(key, row);
        }
      }
    }
    const loadList = [...load.values()]
      .filter((r) => r.qty > 0)
      .map((r) => ({ ...r, label: r.adhoc ? `${Math.round(r.qty * 100) / 100} ${r.unit}` : formatStock(r.qty, products.get(r.key)!) }))
      .sort((a, c) => Number(a.adhoc) - Number(c.adhoc) || collator.compare(a.category, c.category) || collator.compare(a.name, c.name));
    dayItems.push(...loadList);

    // Drop list — by route (when grouped by vehicle) then shop, so a
    // driver's stops in the same area sit together.
    const drops: DropRow[] = b.invoices
      .map((inv) => {
        const total = Number(inv.total);
        const display = customerDisplayName(inv.customer);
        const addressParts = [inv.customer.address?.replace(/\s*\n\s*/g, ', ').trim(), inv.customer.district?.trim()].filter(Boolean) as string[];
        const address = addressParts.length ? [...new Set(addressParts)].join(', ') : null;
        return {
          invoiceId: inv.id,
          customerId: inv.customer.id,
          number: inv.number,
          status: inv.status,
          customer: display,
          contactName: inv.customer.shopName && inv.customer.name !== display ? inv.customer.name : null,
          address,
          phone: inv.customer.phone,
          route: inv.customer.route?.trim() || null,
          amount: total,
          toCollect: Math.max(round2(total - Number(inv.amountPaid)), 0),
          note: inv.deliveryInstructions?.trim() || null,
        };
      })
      .sort(
        (a, c) =>
          (params.group === 'vehicle' ? Number(!a.route) - Number(!c.route) || collator.compare(a.route ?? '', c.route ?? '') : 0) ||
          collator.compare(a.customer, c.customer) ||
          collator.compare(a.number, c.number)
      );

    return {
      key: b.key,
      label: b.label,
      unassigned: b.unassigned,
      driver: b.drivers.size ? [...b.drivers].join(', ') : null,
      totals: totalsOf(drops, loadList),
      loadLabel: loadSummary(loadList),
      load: loadList,
      drops,
    };
  });

  groups.sort((a, c) => Number(a.unassigned) - Number(c.unassigned) || collator.compare(a.label, c.label));

  const allDrops = groups.flatMap((g) => g.drops);
  return {
    ...params,
    totals: totalsOf(allDrops, dayItems),
    loadLabel: loadSummary(dayItems),
    groups,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function totalsOf(drops: DropRow[], load: LoadItem[]): LoadingTotals {
  return {
    invoices: drops.length,
    shops: new Set(drops.map((d) => d.customerId)).size,
    value: round2(drops.reduce((s, d) => s + d.amount, 0)),
    toCollect: round2(drops.reduce((s, d) => s + d.toCollect, 0)),
    mainQty: round6(load.filter((i) => !i.adhoc).reduce((s, i) => s + i.qty, 0)),
  };
}
