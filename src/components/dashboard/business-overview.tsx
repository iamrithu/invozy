import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  FilePen,
  Layers,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  Undo2,
  Users,
} from 'lucide-react';
import type { BusinessOverview, StatusFigures } from '@/actions/dashboard';
import type { InventorySummary } from '@/actions/inventory';
import type { BarSegment } from '@/components/charts/segmented-bar';
import { fmtCompactMoney } from '@/components/reports/format';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';
import { BilledSplitBar } from './billed-split-bar';

// The dashboard's all-time section, in reading order: what the business has
// and who it deals with, what it billed, where that money is, and what it
// bought and earned — then the same invoices laid out by stage. Figures are
// short ("₹12.3L") so three fit in each group; the exact amount is the
// tooltip.

const num = (n: number) => n.toLocaleString('en-IN');
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

type Tone = 'green' | 'gold' | 'red' | undefined;
const TONE_CHIP: Record<NonNullable<Tone> | 'none', string> = {
  green: 'bg-green-soft text-green',
  gold: 'bg-gold-soft text-gold',
  red: 'bg-red-soft text-red',
  none: 'bg-surface-alt text-ink-soft',
};

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

/** One row of shortcuts to what needs doing today — the same things the
 * notification bell lists, one click from the dashboard. Only items with
 * something in them show; when nothing does, a single all-clear line. */
export function AttentionStrip({
  data,
  dueSoon,
  stock,
  currency,
}: {
  data: BusinessOverview;
  dueSoon: { count: number; total: number };
  stock: InventorySummary | null;
  currency: string;
}) {
  const money = (n: number) => fmtCompactMoney(n, currency);
  const m = data.money;
  const drafts = data.invoices.byStatus.DRAFT;
  const items: { key: string; icon: LucideIcon; tone: Tone; title: string; sub: string; href: string }[] = [];

  if (m.overdueCount > 0)
    items.push({ key: 'overdue', icon: AlertTriangle, tone: 'red', title: plural(m.overdueCount, 'overdue invoice'), sub: `${money(m.overdue)} to chase`, href: '/invoices?remind=1' });
  if (dueSoon.count > 0)
    items.push({ key: 'due', icon: Clock, tone: 'gold', title: `${num(dueSoon.count)} due this week`, sub: `${money(dueSoon.total)} coming in`, href: '#due-this-week' });
  if (drafts.count > 0)
    items.push({
      key: 'drafts',
      icon: FilePen,
      tone: undefined,
      title: `${plural(drafts.count, 'draft')} not sent`,
      sub: `${money(drafts.total)}${data.invoices.draftsHoldingStock > 0 ? ' · holding stock' : ''}`,
      href: '/invoices?status=DRAFT',
    });
  if (stock && stock.low + stock.out > 0) {
    const first = stock.lowItems[0];
    items.push({
      key: 'stock',
      icon: Layers,
      tone: stock.out > 0 ? 'red' : 'gold',
      title: [stock.low > 0 ? `${num(stock.low)} running low` : '', stock.out > 0 ? `${num(stock.out)} out of stock` : ''].filter(Boolean).join(', '),
      sub: first ? `${first.name} is ${first.status === 'out' ? 'out of stock' : 'running low'}` : 'See Inventory',
      href: '/inventory',
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl2 border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-soft shadow-card">
        <CheckCircle2 size={15} className="flex-shrink-0 text-green" /> Nothing needs attention right now: no overdue invoices, unsent drafts or stock alerts.
      </div>
    );
  }

  return (
    <section aria-label="Needs attention" className="flex flex-wrap items-center gap-2 rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
      <h2 className="px-1.5 text-[12.5px] font-extrabold text-ink">Needs attention</h2>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className="flex min-h-[44px] min-w-[200px] flex-1 items-center gap-2.5 rounded-lg2 border border-line px-2.5 py-1.5 transition-colors hover:border-brand/50"
        >
          <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2', TONE_CHIP[it.tone ?? 'none'])}>
            <it.icon size={14} />
          </span>
          <span className="min-w-0 text-[12px] leading-tight">
            <b className="block truncate text-ink">{it.title}</b>
            <span className="block truncate text-ink-soft">{it.sub}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Overview groups
// ---------------------------------------------------------------------------

type StatDef = { icon: LucideIcon; tone?: Tone; label: string; value: string; title?: string; sub: React.ReactNode; href: string };

/** Twelve all-time figures in four groups of three. */
export function OverviewGroups({ data, stock, currency }: { data: BusinessOverview; stock: InventorySummary | null; currency: string }) {
  const { products: p, customers: c, suppliers: s, invoices: i, money: m, creditNotes: cn, purchases: buy, profit } = data;
  const money = (n: number) => fmtCompactMoney(n, currency);
  const drafts = i.byStatus.DRAFT.count;
  const paidPct = m.billed > 0.004 ? Math.round((m.received / m.billed) * 100) : null;

  const groups: { title: string; stats: StatDef[] }[] = [
    {
      title: 'Catalogue & customers',
      stats: [
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
      stats: [
        {
          icon: Receipt,
          label: 'Invoices',
          value: num(i.total),
          sub: i.total === 0 ? 'None created yet' : `${num(i.issued)} issued${drafts > 0 ? ` · ${plural(drafts, 'draft')}` : ''}`,
          href: '/invoices',
        },
        {
          icon: Banknote,
          label: 'Total billed',
          value: money(m.billed),
          title: fmtInr(m.billed, currency),
          sub: i.issued > 0 ? `Avg ${money(m.billed / i.issued)} per invoice` : 'Nothing issued yet',
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
    {
      title: 'Payments',
      stats: [
        {
          icon: CheckCircle2,
          tone: 'green',
          label: 'Paid',
          value: money(m.received),
          title: fmtInr(m.received, currency),
          sub: paidPct === null ? 'Nothing billed yet' : `${paidPct}% of billed collected`,
          href: '/reports?tab=collections',
        },
        {
          icon: Clock,
          tone: m.unpaid > 0.004 ? 'gold' : undefined,
          label: 'Unpaid',
          value: money(m.unpaid),
          title: fmtInr(m.unpaid, currency),
          sub: m.openCount > 0 ? plural(m.openCount, 'open invoice') : 'Nothing outstanding',
          href: '/reports?tab=receivables',
        },
        {
          icon: AlertTriangle,
          tone: m.overdue > 0.004 ? 'red' : undefined,
          label: 'Overdue',
          value: money(m.overdue),
          title: fmtInr(m.overdue, currency),
          sub:
            m.overdueCount > 0 ? (
              <span className="font-semibold text-red">
                {plural(m.overdueCount, 'invoice')} · oldest {plural(m.oldestOverdueDays, 'day')}
              </span>
            ) : (
              'Nothing overdue'
            ),
          href: '/invoices?remind=1',
        },
      ],
    },
    {
      title: 'Buying & margin',
      stats: [
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
              ? 'Needs purchase costs'
              : `${(profit.margin * 100).toFixed(1)}% margin${profit.unknownShare > 0.005 ? ` · ${Math.round(profit.unknownShare * 100)}% of sales uncosted` : ''}`,
          href: '/reports',
        },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title} className="min-w-0 rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <h3 className="mb-2.5 text-[13.5px] font-extrabold text-ink">{g.title}</h3>
          <div className="grid grid-cols-3 divide-x divide-line">
            {g.stats.map((st) => (
              <Stat key={st.label} {...st} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, title, sub, href }: StatDef) {
  return (
    <Link href={href} className="group flex min-w-0 flex-col px-2.5 first:pl-0 last:pr-0 sm:px-3.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-ink-soft">
        <span className={cn('hidden h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm2 sm:flex', TONE_CHIP[tone ?? 'none'])}>
          <Icon size={13} />
        </span>
        <span className="truncate group-hover:text-ink">{label}</span>
        <ChevronRight size={12} className="ml-auto hidden flex-shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
      </span>
      <span className="mt-1.5 truncate font-mono text-[19px] font-bold leading-tight tracking-tight text-ink sm:text-[21px]" title={title}>
        {value}
      </span>
      <span className="mt-0.5 text-[11px] leading-snug text-ink-faint">{sub}</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Invoices by stage · billed amount · collection health
// ---------------------------------------------------------------------------

type Stage = { status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID'; label: string; dot: string; f: StatusFigures; amount: number; amountWord: string; note?: string };

/** Every invoice by where it is in its life — draft → sent → part-paid →
 * paid — beside where the billed money stands and how quickly customers
 * pay. Each stage opens the invoice list on that status. */
export function BillingStatus({ data, currency }: { data: BusinessOverview; currency: string }) {
  const { byStatus: s } = data.invoices;
  const m = data.money;
  const col = data.collection;
  const money = (n: number) => fmtCompactMoney(n, currency);

  const stages: Stage[] = [
    {
      status: 'DRAFT',
      label: 'Draft',
      dot: 'bg-ink-faint',
      f: s.DRAFT,
      amount: s.DRAFT.total,
      amountWord: 'not issued',
      note: data.invoices.draftsHoldingStock > 0 ? 'Holding stock' : undefined,
    },
    { status: 'SENT', label: 'Sent', dot: 'bg-gold', f: s.SENT, amount: s.SENT.balance, amountWord: 'awaiting' },
    { status: 'PARTIALLY_PAID', label: 'Part-paid', dot: 'bg-gold', f: s.PARTIALLY_PAID, amount: s.PARTIALLY_PAID.balance, amountWord: 'still due' },
    { status: 'PAID', label: 'Paid', dot: 'bg-green', f: s.PAID, amount: s.PAID.total, amountWord: 'settled' },
  ];

  // Status colours, each named in the legend. Text on a block is near-black
  // or white, whichever reads on that fill in that theme.
  const notDue = Math.max(0, m.unpaid - m.overdue);
  const segments: BarSegment[] = [
    { key: 'paid', label: 'Paid', value: m.received, fill: 'bg-green', ink: 'text-[#1c1c1c]' },
    ...(m.creditAdjusted > 0.004
      ? [{ key: 'credit', label: 'Credit notes', value: m.creditAdjusted, fill: 'bg-[hsl(0_0%_80%)] dark:bg-[hsl(0_0%_38%)]', ink: 'text-[#1c1c1c] dark:text-white' }]
      : []),
    { key: 'notDue', label: 'Not yet due', value: notDue, fill: 'bg-gold', ink: 'text-[#1c1c1c]' },
    { key: 'overdue', label: 'Overdue', value: m.overdue, fill: 'bg-red', ink: 'text-white dark:text-[#1c1c1c]' },
  ];

  return (
    <section className="rounded-xl2 border border-line bg-surface shadow-card">
      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:divide-x lg:divide-y-0">
        <div className="min-w-0 p-4">
          <PanelHeader title="Invoices by stage" subtitle={`${plural(data.invoices.total, 'invoice')} in all`} href="/invoices" linkLabel="All invoices" />
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-5">
            {stages.map((st, idx) => (
              <li key={st.status} className="relative min-w-0">
                <Link
                  href={`/invoices?status=${st.status}`}
                  className="block h-full rounded-lg2 border border-line bg-bg px-3 py-2.5 transition-colors hover:border-brand/50"
                >
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-soft">
                    <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', st.dot)} aria-hidden />
                    {idx + 1} · {st.label}
                  </div>
                  <div className="mt-1 font-mono text-[18px] font-bold leading-tight text-ink">{num(st.f.count)}</div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-faint" title={fmtInr(st.amount, currency)}>
                    <span className="font-mono font-semibold text-ink-body">{money(st.amount)}</span> {st.amountWord}
                  </div>
                  {st.f.overdueCount > 0 ? (
                    <div className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-red">
                      <AlertTriangle size={11} className="flex-shrink-0" /> {num(st.f.overdueCount)} overdue
                    </div>
                  ) : (
                    <div className="mt-1 h-[15px] text-[10.5px] text-ink-faint">{st.note}</div>
                  )}
                </Link>
                {idx < stages.length - 1 && (
                  <ChevronRight size={14} className="absolute -right-[17px] top-1/2 hidden -translate-y-1/2 text-ink-faint sm:block" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="min-w-0 p-4">
          <PanelHeader title="Billed amount" subtitle={m.billed > 0.004 ? `${fmtInr(m.billed, currency)} in all` : undefined} href="/reports?tab=receivables" linkLabel="Receivables" />
          <div className="mt-3">
            {m.billed > 0.004 ? (
              <BilledSplitBar segments={segments} currency={currency} label="Billed amount by payment status" />
            ) : (
              <p className="pb-1 pt-2 text-[12.5px] text-ink-faint">Issue an invoice to see what&apos;s paid and what&apos;s still owed.</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-shrink-0 sm:w-[150px]">
          <h4 className="text-[12.5px] font-extrabold text-ink">Collection health</h4>
          <p className="text-[10.5px] text-ink-faint">{col.paidInvoices > 0 ? `From ${plural(col.paidInvoices, 'paid invoice')}` : 'Shows once invoices are paid'}</p>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <MiniFigure
            value={col.avgDaysToPay === null ? '—' : Math.round(col.avgDaysToPay) === 0 ? 'Same day' : plural(Math.round(col.avgDaysToPay), 'day')}
            label="Average time to get paid"
          />
          <MiniFigure value={col.onTimeShare === null ? '—' : `${Math.round(col.onTimeShare * 100)}%`} label="Paid by the due date" />
          <MiniFigure value={num(data.customers.withDues)} label={data.customers.withDues === 1 ? 'Customer owes you' : 'Customers owe you'} />
        </div>
      </div>
    </section>
  );
}

function MiniFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0 rounded-lg2 bg-bg px-2.5 py-2">
      <div className="truncate font-mono text-[14px] font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{label}</div>
    </div>
  );
}

function PanelHeader({ title, subtitle, href, linkLabel }: { title: string; subtitle?: string; href: string; linkLabel: string }) {
  return (
    <header className="flex items-baseline gap-2">
      <h3 className="flex-shrink-0 whitespace-nowrap text-[13.5px] font-extrabold text-ink">{title}</h3>
      {subtitle && <span className="min-w-0 truncate text-[11.5px] text-ink-faint">{subtitle}</span>}
      <Link href={href} className="ml-auto flex flex-shrink-0 items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
        {linkLabel} <ArrowRight size={11} />
      </Link>
    </header>
  );
}
