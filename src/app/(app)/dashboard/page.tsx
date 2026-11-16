import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2, MapPin, Minus, Package, Receipt, ShoppingCart, Truck, Users } from 'lucide-react';
import {
  getBusinessOverview,
  getDashboardKpis,
  getDueSoon,
  getOpenInvoices,
  getReceivablesAging,
  getRecentInvoices,
  getSalesByRoute,
  getSalesCollectionsTrend,
  type AgingBucket,
  type BusinessOverview,
} from '@/actions/dashboard';
import { getTopCustomers, getTopProducts } from '@/actions/reports';
import { getInventorySummary, getReorderSuggestions, type InventorySummary, type ReorderSuggestions } from '@/actions/inventory';
import { getCompany } from '@/lib/get-company';
import { fmtInr } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { daysBetween, resolveDashboardRange } from '@/lib/dashboard-period';
import { StockStatusBadge } from '@/components/inventory/stock-badges';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sparkline } from '@/components/ui/sparkline';
import { SalesCollectionsChart } from '@/components/dashboard/sales-collections-chart';
import { SalesTarget } from '@/components/dashboard/sales-target';
import { DueSoonCard } from '@/components/dashboard/due-soon-card';
import { AttentionStrip, BillingStatus, OverviewGroups } from '@/components/dashboard/business-overview';
import { DashboardDateFilter } from '@/components/dashboard/date-filter';
import { RecordPaymentLauncher } from '@/components/dashboard/record-payment-launcher';
import { getAppSettings } from '@/lib/settings';
import { customerDisplayName } from '@/lib/customer';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// The dashboard reads top to bottom:
//   · Needs attention — overdue, due this week, unsent drafts, stock alerts.
//   1. Business overview — all time: catalogue and people, billing,
//      payments, buying and margin; every invoice by stage, where the billed
//      money stands, and how quickly customers pay.
//   2. Performance — the date filter (presets or any from–to range) against
//      a fair comparison period: six figures, the trend by day or month,
//      receivables by age, and the top customers, products and routes.
//   3. Day to day — due this week, recent invoices, stock.

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const params = await searchParams;
  const today = todayIst();
  const range = resolveDashboardRange(params, today);
  const filter = { dateFrom: range.from, dateTo: range.to };

  const [company, overview, kpis, trend, aging, recent, dueSoon, settings, stock, reorder, openInvoices, topCustomers, topProducts, routes] = await Promise.all([
    getCompany(),
    getBusinessOverview(),
    getDashboardKpis(range),
    getSalesCollectionsTrend(range.from, range.to),
    getReceivablesAging(),
    getRecentInvoices(6),
    getDueSoon(7),
    getAppSettings(),
    // The stock figures are extras — if they fail, the rest still renders.
    getInventorySummary().catch((err) => {
      console.error('inventory summary failed', err);
      return null;
    }),
    getReorderSuggestions().catch((err) => {
      console.error('reorder suggestions failed', err);
      return null;
    }),
    getOpenInvoices(),
    getTopCustomers(filter, 5),
    getTopProducts(filter, 5),
    getSalesByRoute(range.from, range.to),
  ]);

  const cur = company.currency;
  const { current: c, previous: p, profit, previousProfit } = kpis;
  const productCount = overview.products.active + overview.products.inactive;
  const isBrandNew = productCount === 0 && overview.customers.active + overview.customers.inactive === 0 && overview.invoices.total === 0;
  const collectionRate = c.netSales > 0 ? Math.round((c.collected / c.netSales) * 100) : null;
  const avgInvoice = c.invoices > 0 ? c.sales / c.invoices : 0;
  const todayText = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const showTarget = !!range.monthDays;
  const trendNote =
    trend.points.length > daysBetween(range.from, range.to) + 1 ? `Last ${trend.points.length} days` : `${trend.granularity === 'day' ? 'By day' : 'By month'} · ${range.word}`;

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-ink">{greeting()}</h1>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {company.name} · {todayText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordPaymentLauncher invoices={openInvoices} currency={cur} />
          <HeaderLink href="/reports/loading-sheet" icon={<Truck size={14} />} label="Loading sheet" />
          <HeaderLink href="/reports" icon={<Receipt size={14} />} label="Reports" />
        </div>
      </div>

      {isBrandNew ? <GettingStarted /> : <AttentionStrip data={overview} dueSoon={dueSoon} stock={stock} currency={cur} />}

      <Section title="Business overview" subtitle="All time, up to today">
        <OverviewGroups data={overview} stock={stock} currency={cur} />
        <BillingStatus data={overview} currency={cur} />
      </Section>

      <Section
        title="Performance"
        subtitle={`${range.label}, compared with ${range.previousLabel}`}
        action={<DashboardDateFilter key={`${range.preset}:${range.from}:${range.to}`} preset={range.preset} from={range.from} to={range.to} today={today} />}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <KpiTile
            label="Net sales"
            value={fmtInr(c.netSales, cur)}
            delta={change(c.netSales, p.netSales)}
            sub={c.credits > 0 ? `${fmtInr(c.sales, cur)} billed − ${fmtInr(c.credits, cur)} credit notes` : `${c.invoices} invoice${c.invoices === 1 ? '' : 's'} issued`}
            spark={showTarget && settings.monthlySalesTarget ? undefined : trend.points.map((t) => t.sales)}
            sparkColor="hsl(var(--chart-sales))"
            footer={range.monthDays ? <SalesTarget target={settings.monthlySalesTarget} netSales={c.netSales} days={range.monthDays} currency={cur} /> : undefined}
          />
          <KpiTile
            label="Collected"
            value={fmtInr(c.collected, cur)}
            delta={change(c.collected, p.collected)}
            sub={collectionRate === null ? 'Cash received in this period' : `${collectionRate}% of net sales, cash received`}
            spark={trend.points.map((t) => t.collected)}
            sparkColor="hsl(var(--chart-collected))"
            href="/reports?tab=collections"
          />
          <KpiTile
            label="Gross profit"
            value={profit.margin === null ? '—' : fmtInr(profit.profit, cur)}
            delta={profit.margin !== null && previousProfit.margin !== null ? change(profit.profit, previousProfit.profit) : undefined}
            sub={
              profit.margin === null
                ? c.sales > 0
                  ? 'Add purchase costs to estimate profit'
                  : 'Nothing sold in this period yet'
                : `${(profit.margin * 100).toFixed(1)}% margin${profit.unknownShare > 0.005 ? ` · ${Math.round(profit.unknownShare * 100)}% of sales uncosted` : ''}`
            }
            href="/reports"
          />
          <KpiTile
            label="Invoices issued"
            value={c.invoices.toLocaleString('en-IN')}
            delta={change(c.invoices, p.invoices)}
            sub={c.invoices > 0 ? `Average ${fmtInr(avgInvoice, cur)} per invoice` : 'No invoices issued in this period yet'}
            href="/invoices"
          />
          <KpiTile
            label="Customers billed"
            value={c.customers.toLocaleString('en-IN')}
            delta={change(c.customers, p.customers)}
            sub={c.customers === 0 ? 'No one billed in this period yet' : c.newCustomers > 0 ? `${c.newCustomers} new, billed for the first time` : 'All repeat customers'}
            href="/reports?tab=sales"
          />
          <KpiTile
            label="Still unpaid"
            value={fmtInr(c.unpaid, cur)}
            sub={
              c.sales <= 0.004 ? (
                'Nothing billed in this period'
              ) : c.unpaid > 0.004 ? (
                `${Math.round((c.unpaid / c.sales) * 100)}% of this period's billing is still owed`
              ) : (
                <span className="font-semibold text-green">Every invoice from this period is paid</span>
              )
            }
            href="/reports?tab=receivables"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Sales & collections" subtitle={trendNote} action={{ href: '/reports', label: 'Reports' }}>
            <div className="px-4 pb-3 pt-1">
              <SalesCollectionsChart data={trend.points} granularity={trend.granularity} currency={cur} />
            </div>
          </Card>
          <Card title="Receivables by age" subtitle={overview.money.unpaid > 0.004 ? `${fmtInr(overview.money.unpaid, cur)} owed today` : undefined} action={{ href: '/reports?tab=receivables', label: 'Details' }}>
            <AgingList buckets={aging} currency={cur} biggest={overview.biggestOverdue} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Top customers" subtitle={range.word} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
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
          <Card title="Top products" subtitle={`${range.word}, by value`} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
            {topProducts.byValue.length === 0 ? (
              <Empty>No products sold in this period yet.</Empty>
            ) : (
              <RankTable rows={topProducts.byValue.map((t) => ({ key: t.key, name: t.name, sub: t.qtyLabel, value: t.revenue }))} currency={cur} />
            )}
          </Card>
          <Card title="Sales by route" subtitle={range.word} action={{ href: '/reports/loading-sheet', label: 'Loading sheet' }}>
            {routes.total <= 0.004 ? (
              <Empty>No invoices issued in this period yet.</Empty>
            ) : (
              <>
                <RankTable
                  icon={<MapPin size={12} className="text-ink-faint" />}
                  rows={routes.rows.map((r) => ({
                    key: r.name,
                    name: r.name,
                    sub: `${r.shops} ${r.noRoute ? 'customer' : 'shop'}${r.shops === 1 ? '' : 's'} · ${Math.round(r.share * 100)}% of sales`,
                    value: r.total,
                  }))}
                  currency={cur}
                />
                {!routes.anyRoutes && (
                  <p className="px-4 pb-3 text-[11.5px] text-ink-faint">
                    Give your customers a route (edit a customer on the{' '}
                    <Link href="/customers" className="font-semibold text-brand hover:underline">
                      Customers
                    </Link>{' '}
                    screen) to split sales by beat.
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      </Section>

      <Section title="Day to day" subtitle="Due this week, latest invoices and stock">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <DueSoonCard data={dueSoon} currency={cur} />
          <Card title="Recent invoices" action={{ href: '/invoices', label: 'All invoices' }}>
            {recent.length === 0 ? (
              <Empty>No invoices yet — create your first one to see it here.</Empty>
            ) : (
              <ul className="divide-y divide-line pb-1">
                {recent.map((inv) => (
                  <li key={inv.id}>
                    <Link href={`/invoices/${inv.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 px-4 py-2 transition-colors hover:bg-bg">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[12px] font-bold text-ink">{inv.number}</span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {inv.customer} · {new Date(`${inv.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                        </span>
                      </span>
                      <StatusBadge status={inv.status} overdue={inv.isOverdue} />
                      <span className="text-right">
                        <span className="block whitespace-nowrap font-mono text-[12.5px] font-bold text-ink">{fmtInr(inv.total, cur)}</span>
                        {inv.balance > 0.004 && inv.status !== 'DRAFT' && (
                          <span className="block whitespace-nowrap font-mono text-[10.5px] text-ink-faint">{fmtInr(inv.balance, cur)} due</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <StockCard stock={stock} reorder={reorder} currency={cur} hasProducts={productCount > 0} />
        </div>
      </Section>
    </div>
  );
}

/** A titled band of the dashboard — h2, a one-line note on what it covers
 * (all time, or which dates), and an optional control on the right. */
function Section({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-b border-line pb-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-ink">{title}</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
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
      {spark && spark.length > 1 && (
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
      title="Compared with the comparison period shown under Performance"
    >
      <Icon size={11} /> {text}
    </span>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl2 border border-line bg-surface shadow-card">
      <header className="flex items-baseline gap-2 px-4 pb-2 pt-3.5">
        <h3 className="flex-shrink-0 whitespace-nowrap text-[13.5px] font-extrabold text-ink">{title}</h3>
        {subtitle && <span className="min-w-0 truncate text-[11.5px] text-ink-faint">{subtitle}</span>}
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
function RankTable({ rows, currency, icon }: { rows: { key: string; name: string; sub: string; value: number }[]; currency: string; icon?: React.ReactNode }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ol className="divide-y divide-line px-4 pb-2">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 py-2">
          <span className="font-mono text-[11px] text-ink-faint">{icon ?? i + 1}</span>
          <div className="min-w-0">
            <div className="truncate text-[12.5px] font-bold text-ink">{r.name}</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt" title={`${Math.round((r.value / (total || 1)) * 100)}% of the ${rows.length} shown`}>
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
function AgingList({ buckets, currency, biggest }: { buckets: AgingBucket[]; currency: string; biggest: BusinessOverview['biggestOverdue'] }) {
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
    <div className="px-4 pb-4 pt-1">
      <ul className="space-y-3">
        {buckets.map((b) => (
          <li key={b.key}>
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className={cn('font-semibold', b.overdue && b.amount > 0 ? 'text-ink' : 'text-ink-soft')}>{b.label}</span>
              <span className="whitespace-nowrap font-mono font-bold text-ink">
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
      {biggest && (
        <Link href="/invoices?remind=1" className="mt-3.5 block rounded-lg2 bg-red-soft px-3 py-2 text-[11.5px] leading-snug text-ink-body transition-opacity hover:opacity-90">
          Biggest overdue: <b className="text-ink">{biggest.customer}</b>, <span className="font-mono font-bold text-red">{fmtInr(biggest.amount, currency)}</span>, up to{' '}
          {biggest.days} day{biggest.days === 1 ? '' : 's'} late
        </Link>
      )}
    </div>
  );
}

function StockCard({ stock, reorder, currency, hasProducts }: { stock: InventorySummary | null; reorder: ReorderSuggestions | null; currency: string; hasProducts: boolean }) {
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

  // Low / out-of-stock products plus anything set to run out within the
  // reorder lead time, at the Inventory screen's suggested quantities
  // (1 where it has no sales history to go on) — the bill is editable.
  const suggested = new Map((reorder?.items ?? []).map((i) => [i.id, i.suggested]));
  const ids = [...new Set([...stock.lowItems.map((i) => i.id), ...(reorder?.items ?? []).map((i) => i.id)])].slice(0, 12);
  const purchaseHref = ids.length
    ? `/purchases/new?items=${encodeURIComponent(ids.map((id) => `${id}:${suggested.get(id) || 1}`).join(','))}${reorder?.supplier ? `&supplier=${reorder.supplier.id}` : ''}`
    : null;

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
      {purchaseHref && (
        <div className="border-t border-line px-4 py-2.5">
          <Link
            href={purchaseHref}
            className="flex w-full items-center justify-center gap-1.5 rounded-sm2 border border-line px-3 py-2 text-[12px] font-bold text-ink-body transition-colors hover:border-brand/50 hover:text-ink"
          >
            <ShoppingCart size={13} /> Start a purchase bill for {ids.length} product{ids.length === 1 ? '' : 's'}
          </Link>
        </div>
      )}
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'red' }) {
  return (
    <div className="min-w-0 rounded-lg2 bg-bg px-2.5 py-2">
      <div className={cn('truncate font-mono text-[14px] font-bold', tone === 'red' ? 'text-red' : tone === 'gold' ? 'text-gold' : 'text-ink')}>{value}</div>
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
