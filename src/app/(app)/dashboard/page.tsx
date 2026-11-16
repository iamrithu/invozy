import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, Minus, Package, Plus, Receipt, Truck, Users } from 'lucide-react';
import {
  getAccountSize,
  getDashboardKpis,
  getDueSoon,
  getReceivablesAging,
  getRecentInvoices,
  getSalesCollectionsTrend,
  type AgingBucket,
  type DashboardPeriod,
} from '@/actions/dashboard';
import { getTopCustomers, getTopProducts } from '@/actions/reports';
import { getInventorySummary, type InventorySummary } from '@/actions/inventory';
import { getCompany } from '@/lib/get-company';
import { fmtInr } from '@/lib/gst';
import { StockStatusBadge } from '@/components/inventory/stock-badges';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sparkline } from '@/components/ui/sparkline';
import { SalesCollectionsChart } from '@/components/dashboard/sales-collections-chart';
import { SalesTarget } from '@/components/dashboard/sales-target';
import { DueSoonCard } from '@/components/dashboard/due-soon-card';
import { getAppSettings } from '@/lib/settings';
import { customerDisplayName } from '@/lib/customer';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// The dashboard is the business at a glance: this month's figures against
// the same days of last month, the trend, who owes what, and what's
// selling. Things that need *doing* — overdue invoices, drafts holding
// stock, stock alerts, profile gaps — live in the top bar's notifications
// instead of being stacked here as banners.

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This month' },
  { id: 'fy', label: 'This FY' },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: raw } = await searchParams;
  const period: DashboardPeriod = raw === 'today' || raw === 'fy' ? raw : 'month';
  const [company, size, kpis, trend, aging, recent, dueSoon, settings, stock] = await Promise.all([
    getCompany(),
    getAccountSize(),
    getDashboardKpis(period),
    getSalesCollectionsTrend(period === 'fy' ? 12 : 6),
    getReceivablesAging(),
    getRecentInvoices(6),
    getDueSoon(7),
    getAppSettings(),
    // The stock card is an extra — if it fails, the rest still renders.
    getInventorySummary().catch((err) => {
      console.error('inventory summary failed', err);
      return null;
    }),
  ]);
  const periodFilter = { dateFrom: kpis.from, dateTo: kpis.to };
  const [topCustomers, topProducts] = await Promise.all([getTopCustomers(periodFilter, 5), getTopProducts(periodFilter, 5)]);
  const periodWord = period === 'today' ? 'Today' : period === 'fy' ? 'This financial year' : 'This month';

  const cur = company.currency;
  const { current: c, previous: p, receivables: r } = kpis;
  const isBrandNew = size.products === 0 && size.customers === 0 && size.invoices === 0;
  const collectionRate = c.netSales > 0 ? Math.round((c.collected / c.netSales) * 100) : null;
  const avgInvoice = c.invoices > 0 ? c.sales / c.invoices : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-ink">{greeting()}</h1>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {company.name} · {kpis.periodLabel}, compared with {kpis.previousLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Dashboard period" className="flex rounded-sm2 border border-line bg-surface p-0.5">
            {PERIODS.map((p) => (
              <Link
                key={p.id}
                href={p.id === 'month' ? '/dashboard' : `/dashboard?period=${p.id}`}
                aria-current={p.id === period ? 'page' : undefined}
                className={cn(
                  'rounded-[4px] px-2.5 py-1.5 text-[12px] font-bold transition-colors',
                  p.id === period ? 'bg-ink text-surface' : 'text-ink-soft hover:text-ink'
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <HeaderLink href="/reports/loading-sheet" icon={<Truck size={14} />} label="Loading sheet" />
          <HeaderLink href="/reports" icon={<Receipt size={14} />} label="Reports" />
          <Link
            href="/invoices/new"
            className="flex items-center gap-1.5 rounded-sm2 bg-brand px-3.5 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-brand-dark"
          >
            <Plus size={14} /> New invoice
          </Link>
        </div>
      </div>

      {isBrandNew && <GettingStarted />}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Net sales"
          value={fmtInr(c.netSales, cur)}
          delta={change(c.netSales, p.netSales)}
          sub={c.credits > 0 ? `${fmtInr(c.sales, cur)} billed − ${fmtInr(c.credits, cur)} credit notes` : `${c.invoices} invoice${c.invoices === 1 ? '' : 's'} issued`}
          spark={kpis.monthDays && settings.monthlySalesTarget ? undefined : trend.map((t) => t.sales)}
          sparkColor="hsl(var(--chart-sales))"
          footer={kpis.monthDays ? <SalesTarget target={settings.monthlySalesTarget} netSales={c.netSales} days={kpis.monthDays} currency={cur} /> : undefined}
        />
        <KpiTile
          label="Collected"
          value={fmtInr(c.collected, cur)}
          delta={change(c.collected, p.collected)}
          sub={collectionRate === null ? 'Cash received in this period' : `${collectionRate}% of sales in this period`}
          spark={trend.map((t) => t.collected)}
          sparkColor="hsl(var(--chart-collected))"
        />
        <KpiTile
          label="Receivables"
          value={fmtInr(r.due, cur)}
          sub={
            r.overdue > 0.004 ? (
              <span className="font-semibold text-red">
                {fmtInr(r.overdue, cur)} overdue · {r.overdueCount} invoice{r.overdueCount === 1 ? '' : 's'}
              </span>
            ) : r.openCount > 0 ? (
              `${r.openCount} open invoice${r.openCount === 1 ? '' : 's'}, none overdue`
            ) : (
              'Nothing outstanding'
            )
          }
          href="/reports?tab=receivables"
        />
        <KpiTile
          label="Invoices issued"
          value={String(c.invoices)}
          delta={change(c.invoices, p.invoices)}
          sub={c.invoices > 0 ? `Average ${fmtInr(avgInvoice, cur)} per invoice` : 'No invoices issued in this period yet'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Sales & collections" subtitle={`Last ${trend.length} months`} action={{ href: '/reports', label: 'Reports' }}>
          <div className="px-4 pb-3 pt-1">
            <SalesCollectionsChart data={trend} currency={cur} />
          </div>
        </Card>
        <Card title="Receivables by age" subtitle={r.due > 0 ? `${fmtInr(r.due, cur)} owed` : undefined} action={{ href: '/reports?tab=receivables', label: 'Details' }}>
          <AgingList buckets={aging} currency={cur} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top customers" subtitle={periodWord} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
          {topCustomers.length === 0 ? (
            <Empty>No invoices issued in this period yet.</Empty>
          ) : (
            <RankTable
              rows={topCustomers.map((t) => ({
                key: t.name + (t.shopName ?? ''),
                name: customerDisplayName(t),
                sub: `${t.count} invoice${t.count === 1 ? '' : 's'}${t.balance > 0.004 ? ` · ${fmtInr(t.balance, cur)} due` : ''}`,
                value: t.total,
              }))}
              currency={cur}
            />
          )}
        </Card>
        <Card title="Top products" subtitle={`${periodWord}, by sales value`} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
          {topProducts.byValue.length === 0 ? (
            <Empty>No products sold in this period yet.</Empty>
          ) : (
            <RankTable rows={topProducts.byValue.map((t) => ({ key: t.key, name: t.name, sub: t.qtyLabel, value: t.revenue }))} currency={cur} />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <DueSoonCard data={dueSoon} currency={cur} />
        <Card title="Recent invoices" action={{ href: '/invoices', label: 'All invoices' }}>
          {recent.length === 0 ? (
            <Empty>No invoices yet — create your first one to see it here.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <tbody className="divide-y divide-line">
                  {recent.map((inv) => (
                    <tr key={inv.id} className="transition-colors hover:bg-bg">
                      <td className="py-2 pl-4 pr-2">
                        <Link href={`/invoices/${inv.id}`} className="font-mono font-bold text-ink hover:text-brand">
                          {inv.number}
                        </Link>
                        <div className="max-w-[180px] truncate text-[11px] text-ink-faint">
                          {inv.customer} · {new Date(inv.date).toLocaleDateString('en-IN')}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={inv.status} overdue={inv.isOverdue} />
                      </td>
                      <td className="py-2 pl-2 pr-4 text-right">
                        <div className="font-mono font-bold text-ink">{fmtInr(inv.total, cur)}</div>
                        {inv.balance > 0.004 && inv.status !== 'DRAFT' && <div className="font-mono text-[10.5px] text-ink-faint">{fmtInr(inv.balance, cur)} due</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <StockCard stock={stock} currency={cur} hasProducts={size.products > 0} />
      </div>
    </div>
  );
}

type Delta = { pct: number | null; dir: 'up' | 'down' | 'flat' };

function change(now: number, before: number): Delta {
  if (before <= 0) return { pct: null, dir: now > 0 ? 'up' : 'flat' };
  const pct = ((now - before) / before) * 100;
  return { pct, dir: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat' };
}

function KpiTile({
  label,
  value,
  delta,
  sub,
  spark,
  sparkColor,
  href,
  footer,
}: {
  label: string;
  value: string;
  delta?: Delta;
  sub?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  href?: string;
  /** Extra content under the figures — the sales-target progress. */
  footer?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold text-ink-soft">{label}</span>
        {delta && <DeltaPill delta={delta} />}
      </div>
      <div className="mt-1.5 font-mono text-[22px] font-bold leading-tight tracking-tight text-ink">{value}</div>
      <div className="mt-1 min-h-[16px] text-[11.5px] text-ink-faint">{sub}</div>
      {spark && (
        <div className="mt-2">
          <Sparkline values={spark} color={sparkColor} />
        </div>
      )}
      {footer && <div className="mt-2.5 border-t border-line pt-2.5">{footer}</div>}
    </>
  );
  const cls = 'block rounded-xl2 border border-line bg-surface p-4 shadow-card';
  return href ? (
    <Link href={href} className={cn(cls, 'transition-colors hover:border-brand/50')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Signed change vs the comparison period — arrow + text, never colour
 * alone. Up is good for every tile that shows one. */
function DeltaPill({ delta }: { delta: Delta }) {
  const Icon = delta.dir === 'up' ? ArrowUpRight : delta.dir === 'down' ? ArrowDownRight : Minus;
  const text = delta.pct === null ? (delta.dir === 'up' ? 'New' : '—') : `${delta.pct > 0 ? '+' : ''}${Math.abs(delta.pct) >= 100 ? delta.pct.toFixed(0) : delta.pct.toFixed(1)}%`;
  return (
    <span
      className={cn(
        'flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-bold',
        delta.dir === 'up' ? 'bg-green-soft text-green' : delta.dir === 'down' ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'
      )}
      title="Compared with the previous period (same number of days)"
    >
      <Icon size={11} /> {text}
    </span>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl2 border border-line bg-surface shadow-card">
      <header className="flex items-baseline gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-[13.5px] font-extrabold text-ink">{title}</h2>
        {subtitle && <span className="truncate text-[11.5px] text-ink-faint">{subtitle}</span>}
        {action && (
          <Link href={action.href} className="ml-auto flex flex-shrink-0 items-center gap-1 text-[11.5px] font-bold text-brand hover:underline">
            {action.label} <ArrowRight size={11} />
          </Link>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 pb-5 pt-2 text-[12.5px] text-ink-faint">{children}</p>;
}

/** Ranked list with an inline magnitude bar (one hue, so no legend). */
function RankTable({ rows, currency }: { rows: { key: string; name: string; sub: string; value: number }[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ol className="divide-y divide-line px-4 pb-2">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 py-2">
          <span className="font-mono text-[11px] text-ink-faint">{i + 1}</span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold text-ink">{r.name}</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt" title={`${Math.round((r.value / (total || 1)) * 100)}% of the top ${rows.length}`}>
              <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: 'hsl(var(--chart-sales))' }} />
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-ink-faint">{r.sub}</div>
          </div>
          <span className="font-mono text-[12.5px] font-bold text-ink">{fmtInr(r.value, currency)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Receivables split by lateness. Overdue rows carry the red status colour
 * *and* the "late" label, so the state never relies on colour alone. */
function AgingList({ buckets, currency }: { buckets: AgingBucket[]; currency: string }) {
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  if (total <= 0.004) {
    return (
      <div className="flex items-center gap-2 px-4 pb-5 pt-2 text-[12.5px] text-ink-soft">
        <CheckCircle2 size={15} className="text-green" /> No money is owed on issued invoices.
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.amount), 1);
  return (
    <ul className="space-y-3 px-4 pb-4 pt-1">
      {buckets.map((b) => (
        <li key={b.key}>
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className={cn('font-semibold', b.overdue && b.amount > 0 ? 'text-ink' : 'text-ink-soft')}>{b.label}</span>
            <span className="font-mono font-bold text-ink">
              {fmtInr(b.amount, currency)}
              <span className="ml-1.5 font-sans text-[10.5px] font-normal text-ink-faint">
                {b.count} inv · {Math.round((b.amount / total) * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
            <div
              className="h-full rounded-full"
              style={{ width: `${(b.amount / max) * 100}%`, background: b.overdue ? 'hsl(var(--red))' : 'hsl(var(--chart-collected))' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StockCard({ stock, currency, hasProducts }: { stock: InventorySummary | null; currency: string; hasProducts: boolean }) {
  if (!stock) return null;
  if (stock.tracked === 0) {
    if (!hasProducts) return null;
    return (
      <Card title="Stock">
        <Link href="/inventory" className="mx-4 mb-4 flex items-center gap-3 rounded-lg2 border border-dashed border-line p-3 transition-colors hover:border-brand/50">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
            <Boxes size={16} />
          </span>
          <span className="text-[12px] text-ink-soft">
            <b className="block text-[12.5px] text-ink">Start tracking stock</b>
            Count each product once on the Inventory screen — sent and paid invoices keep it up to date after that.
          </span>
        </Link>
      </Card>
    );
  }
  return (
    <Card title="Stock" subtitle={`${stock.tracked} tracked`} action={{ href: '/inventory', label: 'Inventory' }}>
      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        <MiniStat label="Value on hand" value={fmtInr(stock.stockValue, currency)} />
        <MiniStat label="Running low" value={String(stock.low)} tone={stock.low > 0 ? 'gold' : undefined} />
        <MiniStat label="Out of stock" value={String(stock.out)} tone={stock.out > 0 ? 'red' : undefined} />
      </div>
      {stock.lowItems.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {stock.lowItems.map((p) => (
            <li key={p.id}>
              <Link href={`/inventory/${p.id}`} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-bg">
                <Package size={13} className="flex-shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{p.name}</span>
                <span className="flex-shrink-0 font-mono text-[11.5px] text-ink-soft">{p.stockText}</span>
                <StockStatusBadge status={p.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[12px] text-ink-soft">
          <CheckCircle2 size={14} className="text-green" /> Every tracked product is above its alert level.
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'red' }) {
  return (
    <div className="rounded-lg2 bg-bg px-2.5 py-2">
      <div className={cn('font-mono text-[14px] font-bold', tone === 'red' ? 'text-red' : tone === 'gold' ? 'text-gold' : 'text-ink')}>{value}</div>
      <div className="mt-0.5 text-[10.5px] text-ink-faint">{label}</div>
    </div>
  );
}

function HeaderLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-sm2 border border-line bg-surface px-3 py-2 text-[12.5px] font-bold text-ink-body transition-colors hover:border-brand/50 hover:text-ink"
    >
      {icon} {label}
    </Link>
  );
}

function GettingStarted() {
  const steps = [
    { href: '/products', icon: Package, label: 'Add a product', desc: 'Your catalog — what you sell, and at what price' },
    { href: '/customers', icon: Users, label: 'Add a customer', desc: "Who you're billing, and their GST state" },
    { href: '/invoices/new', icon: Receipt, label: 'Create your first invoice', desc: 'Pick a customer, add products, and send it' },
  ];
  return (
    <div className="rounded-xl2 border border-brand bg-brand-light p-4">
      <div className="text-[13.5px] font-extrabold text-brand-dark">Get set up in three steps</div>
      <p className="mt-0.5 text-[12px] text-ink-soft">Here&apos;s the fastest way to your first invoice.</p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {steps.map((s, i) => (
          <Link key={s.href} href={s.href} className="flex items-start gap-2.5 rounded-lg2 border border-line bg-surface p-3 transition-colors hover:border-brand/50">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand text-[11px] font-extrabold text-white">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                <s.icon size={13} className="text-brand" /> {s.label}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">{s.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function greeting() {
  // IST hour — the server may run in UTC.
  const h = new Date(Date.now() + 5.5 * 3600 * 1000).getUTCHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
