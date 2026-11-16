import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Minus,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  Undo2,
  Users,
} from 'lucide-react';
import type { BusinessOverview, DashboardKpis } from '@/actions/dashboard';
import type { InventorySummary } from '@/actions/inventory';
import { fmtInr } from '@/lib/gst';
import { Sparkline } from '@/components/ui/sparkline';
import { cn } from '@/lib/utils';

// The dashboard's two rows of figures share one shape — four groups of
// three — so the date-wise row reads as the same picture as the all-time
// totals above it, just for the chosen dates:
//
//   Catalogue & customers · Invoices & billing · Payments · Buying & margin
//
// Payments is one flow that adds up: Total billed = Paid + Unpaid — or,
// with the dashboard's Include drafts switch on, Overall = Paid + Remaining
// (drafts + unpaid) — with overdue as a badge (see paymentsGroup).
//
// Every amount is written out in full, in rupees (₹85,000.00) — the same
// figures, by the same rules, as the Reports page: issued invoices only
// (drafts are noted, never added), GST included, since that's what
// customers pay. The GST split lives on Reports.

const num = (n: number) => n.toLocaleString('en-IN');
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

type Tone = 'green' | 'gold' | 'red' | undefined;
const TONE_CHIP: Record<NonNullable<Tone> | 'none', string> = {
  green: 'bg-green-soft text-green',
  gold: 'bg-gold-soft text-gold',
  red: 'bg-red-soft text-red',
  none: 'bg-surface-alt text-ink-soft',
};

export type DeltaView = { text: string; dir: 'up' | 'down' | 'flat'; tone: 'good' | 'bad' | 'neutral'; title: string };

export type Figure = {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  value: string;
  /** Exact figure behind a short value. */
  title?: string;
  sub: React.ReactNode;
  href: string;
  delta?: DeltaView;
  /** A small trend line under the figure. */
  spark?: { values: number[]; color: string };
  /** A status badge beside the value — "₹1.8K overdue". */
  badge?: { text: string; title: string };
};

export type FigureGroup = { title: string; figures: Figure[]; footer?: React.ReactNode };

export function FigureGroups({ groups }: { groups: FigureGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title} className="flex min-w-0 flex-col rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <h3 className="mb-2.5 text-[13.5px] font-extrabold text-ink">{g.title}</h3>
          <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {g.figures.map((f) => (
              <FigureCell key={f.label} {...f} />
            ))}
          </div>
          {g.footer && <div className="mt-3 border-t border-line pt-3">{g.footer}</div>}
        </div>
      ))}
    </div>
  );
}

function FigureCell({ icon: Icon, tone, label, value, title, sub, href, delta, spark, badge }: Figure) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col py-2.5 first:pt-0 last:pb-0 sm:px-3.5 sm:py-0 sm:first:pl-0 sm:last:pr-0">
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
        <span className={cn('hidden h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 sm:flex', TONE_CHIP[tone ?? 'none'])}>
          <Icon size={13} />
        </span>
        <span className="min-w-0 leading-tight group-hover:text-ink sm:truncate">{label}</span>
        <ChevronRight size={12} className="ml-auto hidden flex-shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="font-mono text-[18px] font-bold leading-tight tracking-tight text-ink xl:text-[19px]" title={title}>
          {value}
        </span>
        {delta && <DeltaPill delta={delta} />}
        {badge && (
          <span title={badge.title} className="flex flex-shrink-0 items-center gap-1 rounded-full bg-red-soft px-1.5 py-0.5 text-[10px] font-bold text-red">
            <AlertTriangle size={10} /> {badge.text}
          </span>
        )}
      </span>
      <span className="mt-0.5 text-[11px] leading-snug text-ink-faint">{sub}</span>
      {spark && spark.values.length > 1 && <Sparkline values={spark.values} color={spark.color} />}
    </Link>
  );
}

/** The Payments total as one thin bar — paid (green), drafts not sent yet
 * (grey), owed but not yet due (gold), overdue (red) — with each part's
 * share named underneath. The amounts are in the cells above. */
function MoneySplit({ parts, caption }: { parts: { key: string; label: string; value: number; bar: string; dot: string }[]; caption: string }) {
  const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0);
  if (total <= 0.004) return null;
  const shown = parts.filter((p) => p.value > 0.004);
  const pct = (v: number) => {
    const x = (v / total) * 100;
    return x > 0 && x < 1 ? '<1%' : `${Math.round(x)}%`;
  };
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px]" role="img" aria-label={`${caption}: ${shown.map((p) => `${p.label} ${pct(p.value)}`).join(', ')}`}>
        {shown.map((p) => (
          <span key={p.key} className={cn('h-full min-w-[3px] rounded-full', p.bar)} style={{ flex: `${p.value} 1 0%` }} title={`${p.label} · ${pct(p.value)}`} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-faint">
        <span className="font-semibold text-ink-soft">{caption}</span>
        {shown.map((p) => (
          <span key={p.key} className="flex items-center gap-1">
            <span className={cn('h-2 w-2 rounded-full', p.dot)} aria-hidden />
            <span className="font-mono font-semibold text-ink-body">{pct(p.value)}</span> {p.label.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

const SPLIT = {
  paid: { bar: 'bg-green', dot: 'bg-green' },
  draft: { bar: 'bg-[hsl(0_0%_78%)] dark:bg-[hsl(0_0%_40%)]', dot: 'bg-[hsl(0_0%_78%)] dark:bg-[hsl(0_0%_40%)]' },
  notDue: { bar: 'bg-gold', dot: 'bg-gold' },
  overdue: { bar: 'bg-red', dot: 'bg-red' },
};

/** The Payments group, all time or for the chosen dates — one flow that
 * adds up. By default it's the actual position, by the same rules as
 * Reports: Total billed (sent and paid invoices, GST included) = Paid +
 * Unpaid. With "Include drafts" on, the drafts are added in: Overall = Paid
 * + Remaining, where Remaining is drafts + unpaid. Either way the overdue
 * part is a red badge on the last figure. */
function paymentsGroup(o: {
  currency: string;
  includeDrafts: boolean;
  issued: number;
  issuedCount: number;
  drafts: number;
  draftCount: number;
  owed: number;
  owedCount: number;
  overdue: number;
  overdueCount: number;
  oldestOverdueDays?: number;
  paidNote?: string;
  creditSettled?: number;
  deltas?: { total?: DeltaView; paid?: DeltaView };
  spark?: Figure['spark'];
}): FigureGroup {
  const money = (n: number) => fmtInr(n, o.currency);
  const withDrafts = o.includeDrafts;
  const paid = Math.max(0, o.issued - o.owed);
  const total = o.issued + (withDrafts ? o.drafts : 0);
  const remaining = o.owed + (withDrafts ? o.drafts : 0);
  const pct = total > 0.004 ? Math.round((paid / total) * 100) : null;
  const totalWord = withDrafts ? 'the overall' : 'the total billed';
  const overdueBadge =
    o.overdue > 0.004
      ? {
          text: `${money(o.overdue)} overdue`,
          title: `${plural(o.overdueCount, 'invoice')} past the due date${o.oldestOverdueDays ? `, the oldest by ${plural(o.oldestOverdueDays, 'day')}` : ''}`,
        }
      : undefined;

  return {
    title: withDrafts ? 'Payments · drafts included' : 'Payments',
    footer:
      total > 0.004 ? (
        <MoneySplit
          caption={withDrafts ? 'Of the overall' : 'Of the total billed'}
          parts={[
            { key: 'paid', label: 'Paid', value: paid, ...SPLIT.paid },
            ...(withDrafts ? [{ key: 'draft', label: 'Drafts', value: o.drafts, ...SPLIT.draft }] : []),
            { key: 'notDue', label: 'Unpaid, not yet due', value: Math.max(0, o.owed - o.overdue), ...SPLIT.notDue },
            { key: 'overdue', label: 'Overdue', value: o.overdue, ...SPLIT.overdue },
          ]}
        />
      ) : undefined,
    figures: [
      withDrafts
        ? {
            icon: Banknote,
            label: 'Overall',
            value: money(total),
            delta: o.deltas?.total,
            sub: total > 0.004 ? `${money(o.issued)} sent and paid + ${money(o.drafts)} in ${plural(o.draftCount, 'draft')}` : 'No invoices yet',
            href: '/invoices',
            spark: o.spark,
          }
        : {
            icon: Banknote,
            label: 'Total billed',
            value: money(o.issued),
            delta: o.deltas?.total,
            sub: (
              <>
                {o.issuedCount > 0 ? `${plural(o.issuedCount, 'sent and paid invoice')}, GST included` : 'Nothing issued yet'}
                {o.draftCount > 0 && (
                  <span className="block text-ink-soft">
                    Not counted: {money(o.drafts)} in {plural(o.draftCount, 'draft')}
                  </span>
                )}
              </>
            ),
            href: '/invoices?status=SENT,PARTIALLY_PAID,PAID',
            spark: o.spark,
          },
      {
        icon: CheckCircle2,
        tone: 'green',
        label: 'Paid',
        value: money(paid),
        delta: o.deltas?.paid,
        sub:
          pct === null
            ? 'Nothing billed yet'
            : // One note at most, so the line stays short: credit notes when
              // some of it was settled that way, else how fast customers pay.
              `${pct}% of ${totalWord}${
                o.creditSettled && o.creditSettled > 0.004 ? ` · ${money(o.creditSettled)} by credit notes` : o.paidNote ? ` · ${o.paidNote}` : ''
              }`,
        href: '/invoices?status=PAID',
      },
      withDrafts
        ? {
            icon: Clock,
            tone: o.overdue > 0.004 ? 'red' : remaining > 0.004 ? 'gold' : undefined,
            label: 'Remaining',
            value: money(remaining),
            badge: overdueBadge,
            sub:
              remaining > 0.004 ? (
                `${money(o.drafts)} in drafts + ${money(o.owed)} unpaid`
              ) : total > 0.004 ? (
                <span className="font-semibold text-green">Nothing remaining</span>
              ) : (
                'Nothing owed'
              ),
            href: '/invoices?status=DRAFT,SENT,PARTIALLY_PAID',
          }
        : {
            icon: Clock,
            tone: o.overdue > 0.004 ? 'red' : o.owed > 0.004 ? 'gold' : undefined,
            label: 'Unpaid',
            value: money(o.owed),
            badge: overdueBadge,
            sub:
              o.owedCount > 0 ? (
                `${plural(o.owedCount, 'invoice')} still owed${o.overdueCount > 0 ? `, ${num(o.overdueCount)} overdue` : ''}`
              ) : o.issued > 0.004 ? (
                <span className="font-semibold text-green">Everything is paid</span>
              ) : (
                'Nothing owed'
              ),
            href: '/invoices?status=SENT,PARTIALLY_PAID',
          },
    ],
  };
}

/** Signed change vs the comparison period — arrow + text, never colour
 * alone; green/red only where up or down is clearly good or bad. */
function DeltaPill({ delta }: { delta: DeltaView }) {
  const Icon = delta.dir === 'up' ? ArrowUpRight : delta.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      title={delta.title}
      className={cn(
        'flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold',
        delta.tone === 'good' ? 'bg-green-soft text-green' : delta.tone === 'bad' ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'
      )}
    >
      <Icon size={10} /> {delta.text}
    </span>
  );
}

/** Change from `before` to `now`. `good` says which way is good news;
 * nothing at all when both are zero. */
function change(now: number, before: number, good: 'up' | 'down' | 'neutral', previous: string, fmt: (n: number) => string): DeltaView | undefined {
  if (Math.abs(now) <= 0.004 && Math.abs(before) <= 0.004) return undefined;
  const title = `${fmt(before)} in ${previous}`;
  const toneFor = (dir: 'up' | 'down' | 'flat'): DeltaView['tone'] =>
    dir === 'flat' || good === 'neutral' ? 'neutral' : (dir === 'up') === (good === 'up') ? 'good' : 'bad';
  if (before <= 0.004) return { text: 'New', dir: 'up', tone: toneFor('up'), title };
  const pct = ((now - before) / Math.abs(before)) * 100;
  const dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const text = `${pct > 0 ? '+' : ''}${Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%`;
  return { text, dir, tone: toneFor(dir), title };
}

// ---------------------------------------------------------------------------
// All-time totals
// ---------------------------------------------------------------------------

export function totalsGroups(data: BusinessOverview, stock: InventorySummary | null, currency: string, includeDrafts = false): FigureGroup[] {
  const { products: p, customers: c, suppliers: s, invoices: i, money: m, creditNotes: cn, purchases: buy, profit, collection } = data;
  const money = (n: number) => fmtInr(n, currency);
  const drafts = i.byStatus.DRAFT.count;
  const avgDays = collection.avgDaysToPay === null ? null : Math.round(collection.avgDaysToPay);

  return [
    {
      title: 'Catalogue & customers',
      figures: [
        {
          icon: Package,
          label: 'Products',
          value: num(p.active),
          sub: p.active + p.inactive === 0 ? 'None added yet' : `${plural(p.categories, 'category', 'categories')}${p.inactive > 0 ? ` · ${num(p.inactive)} inactive` : ''}`,
          href: '/products',
        },
        {
          icon: Users,
          label: 'Customers',
          value: num(c.active),
          sub: c.withDues > 0 ? `${num(c.withDues)} with dues` : c.active > 0 ? 'No dues pending' : 'None added yet',
          href: '/customers',
        },
        {
          icon: Truck,
          label: 'Suppliers',
          value: num(s.active),
          sub: s.active + s.inactive === 0 ? 'None added yet' : s.inactive > 0 ? `${num(s.inactive)} inactive` : 'All active',
          href: '/suppliers',
        },
      ],
    },
    {
      title: 'Invoices & billing',
      figures: [
        {
          icon: Receipt,
          label: 'Invoices',
          value: num(i.total),
          sub: i.total === 0 ? 'None created yet' : `${num(i.issued)} issued${drafts > 0 ? ` · ${plural(drafts, 'draft')}` : ''}`,
          href: '/invoices',
        },
        {
          icon: Calculator,
          label: 'Average invoice',
          value: i.issued > 0 ? money(m.billed / i.issued) : '—',
          title: i.issued > 0 ? fmtInr(m.billed / i.issued, currency) : undefined,
          sub: i.issued > 0 ? `Across ${plural(i.issued, 'issued invoice')}` : 'Nothing issued yet',
          href: '/reports',
        },
        {
          icon: Undo2,
          label: 'Credit notes',
          value: money(cn.total),
          title: fmtInr(cn.total, currency),
          sub: cn.count === 0 ? 'None raised' : `${plural(cn.count, 'note')}${m.billed > 0.004 ? ` · ${((cn.total / m.billed) * 100).toFixed(1)}% of billed` : ''}`,
          href: '/credit-notes',
        },
      ],
    },
    paymentsGroup({
      currency,
      includeDrafts,
      issued: m.billed,
      issuedCount: i.issued,
      drafts: i.byStatus.DRAFT.total,
      draftCount: drafts,
      owed: m.unpaid,
      owedCount: m.openCount,
      overdue: m.overdue,
      overdueCount: m.overdueCount,
      oldestOverdueDays: m.oldestOverdueDays,
      creditSettled: m.creditAdjusted,
      paidNote: avgDays === null ? undefined : avgDays === 0 ? 'paid same day on avg' : `paid in ~${plural(avgDays, 'day')}`,
    }),
    {
      title: 'Buying & margin',
      figures: [
        {
          icon: ShoppingCart,
          label: 'Purchases',
          value: money(buy.total),
          title: fmtInr(buy.total, currency),
          sub: buy.count === 0 ? 'No bills entered yet' : `${plural(buy.count, 'bill')} from ${plural(buy.suppliers, 'supplier')}`,
          href: '/purchases',
        },
        {
          icon: Layers,
          label: 'Stock value',
          value: stock ? money(stock.stockValue) : '—',
          title: stock ? fmtInr(stock.stockValue, currency) : undefined,
          sub: !stock ? 'Unavailable right now' : stock.tracked === 0 ? 'No stock tracked yet' : `${plural(stock.tracked, 'product')} tracked`,
          href: '/inventory',
        },
        {
          icon: TrendingUp,
          tone: profit.margin !== null && profit.profit > 0 ? 'green' : undefined,
          label: 'Gross profit',
          value: profit.margin === null ? '—' : money(profit.profit),
          title: profit.margin === null ? undefined : fmtInr(profit.profit, currency),
          sub:
            profit.margin === null
              ? 'Enter purchase bills to see it'
              : `${(profit.margin * 100).toFixed(1)}% margin${profit.unknownShare > 0.005 ? ` · ${Math.round(profit.unknownShare * 100)}% of sales uncosted` : ''}`,
          href: '/reports',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// The same figures for the chosen dates
// ---------------------------------------------------------------------------

export function periodGroups(
  k: DashboardKpis,
  opts: { currency: string; previous: string; topProduct: string | null; includeDrafts?: boolean; targetFooter?: React.ReactNode; spark?: { sales: number[]; collected: number[] } }
): FigureGroup[] {
  const { current: c, previous: p, profit, previousProfit } = k;
  const { currency, previous } = opts;
  const money = (n: number) => fmtInr(n, currency);
  const exact = (n: number) => fmtInr(n, currency);
  const count = (n: number) => num(n);

  return [
    {
      title: 'Catalogue & customers',
      figures: [
        {
          icon: Package,
          label: 'Products sold',
          value: num(c.productsSold),
          delta: change(c.productsSold, p.productsSold, 'up', previous, count),
          sub: c.productsSold === 0 ? 'Nothing sold on these dates' : opts.topProduct ? `Best seller: ${opts.topProduct}` : `${plural(c.lines, 'invoice line')}`,
          href: '/reports?tab=sales',
        },
        {
          icon: Users,
          label: 'Customers billed',
          value: num(c.customers),
          delta: change(c.customers, p.customers, 'up', previous, count),
          sub: c.customers === 0 ? 'No one billed on these dates' : c.newCustomers > 0 ? `${num(c.newCustomers)} new, billed for the first time` : 'All repeat customers',
          href: '/reports?tab=sales',
        },
        {
          icon: Truck,
          label: 'Suppliers',
          value: num(c.suppliers),
          delta: change(c.suppliers, p.suppliers, 'neutral', previous, count),
          sub: c.purchaseCount === 0 ? 'Nothing bought on these dates' : `Bought from · ${plural(c.purchaseCount, 'purchase bill')}`,
          href: '/purchases',
        },
      ],
    },
    {
      title: 'Invoices & billing',
      footer: opts.targetFooter,
      figures: [
        {
          icon: Receipt,
          label: 'Invoices issued',
          value: num(c.invoices),
          delta: change(c.invoices, p.invoices, 'up', previous, count),
          sub:
            c.invoices === 0
              ? c.drafts > 0
                ? `${plural(c.drafts, 'draft')} not issued yet`
                : 'None issued on these dates'
              : c.drafts > 0
                ? `+ ${plural(c.drafts, 'draft')} not issued yet`
                : 'No drafts waiting',
          href: '/invoices',
        },
        {
          icon: Calculator,
          label: 'Average invoice',
          value: c.invoices > 0 ? money(c.sales / c.invoices) : '—',
          title: c.invoices > 0 ? exact(c.sales / c.invoices) : undefined,
          delta: c.invoices > 0 && p.invoices > 0 ? change(c.sales / c.invoices, p.sales / p.invoices, 'up', previous, exact) : undefined,
          sub: c.invoices > 0 ? `Across ${plural(c.invoices, 'issued invoice')}` : 'Nothing issued on these dates',
          href: '/reports',
        },
        {
          icon: Undo2,
          label: 'Credit notes',
          value: money(c.credits),
          title: exact(c.credits),
          delta: change(c.credits, p.credits, 'down', previous, exact),
          sub: c.creditCount === 0 ? 'None raised on these dates' : plural(c.creditCount, 'note'),
          href: '/credit-notes',
        },
      ],
    },
    paymentsGroup({
      currency,
      includeDrafts: !!opts.includeDrafts,
      issued: c.sales,
      issuedCount: c.invoices,
      drafts: c.draftsValue,
      draftCount: c.drafts,
      owed: c.unpaid,
      owedCount: c.openCount,
      overdue: c.overdue,
      overdueCount: c.overdueCount,
      deltas: {
        total: opts.includeDrafts ? change(c.sales + c.draftsValue, p.sales + p.draftsValue, 'up', previous, exact) : change(c.sales, p.sales, 'up', previous, exact),
        paid: change(c.sales - c.unpaid, p.sales - p.unpaid, 'up', previous, exact),
      },
      spark: opts.spark ? { values: opts.spark.sales, color: 'hsl(var(--chart-sales))' } : undefined,
    }),
    {
      title: 'Buying & margin',
      figures: [
        {
          icon: ShoppingCart,
          label: 'Purchases',
          value: money(c.purchases),
          title: exact(c.purchases),
          delta: change(c.purchases, p.purchases, 'neutral', previous, exact),
          sub: c.purchaseCount === 0 ? 'No bills on these dates' : `${plural(c.purchaseCount, 'bill')} from ${plural(c.suppliers, 'supplier')}`,
          href: '/purchases',
        },
        {
          icon: Banknote,
          label: 'Net sales',
          value: money(c.netSales),
          title: exact(c.netSales),
          delta: change(c.netSales, p.netSales, 'up', previous, exact),
          sub: c.credits > 0.004 ? `Billed − ${money(c.credits)} credit notes` : 'Billed, less credit notes',
          href: '/reports',
        },
        {
          icon: TrendingUp,
          tone: profit.margin !== null && profit.profit > 0 ? 'green' : undefined,
          label: 'Gross profit',
          value: profit.margin === null ? '—' : money(profit.profit),
          title: profit.margin === null ? undefined : exact(profit.profit),
          delta: profit.margin !== null && previousProfit.margin !== null ? change(profit.profit, previousProfit.profit, 'up', previous, exact) : undefined,
          sub:
            profit.margin === null
              ? c.sales > 0.004
                ? 'Enter purchase bills to see it'
                : 'Nothing sold on these dates'
              : `${(profit.margin * 100).toFixed(1)}% margin${profit.unknownShare > 0.005 ? ` · ${Math.round(profit.unknownShare * 100)}% uncosted` : ''}`,
          href: '/reports',
        },
      ],
    },
  ];
}
