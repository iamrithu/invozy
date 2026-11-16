import Link from 'next/link';
import { ArrowRight, Boxes, CheckCircle2, MapPin, Package, Receipt, ShoppingCart, Truck, Users } from 'lucide-react';
import {
  getBusinessOverview,
  getDashboardKpis,
  getDueSoon,
  getFirstActivityDate,
  getOpenInvoices,
  getPaymentModes,
  getRecentInvoices,
  getRunningTotals,
  getSalesByRoute,
  getSalesCollectionsTrend,
} from '@/actions/dashboard';
import { getSalesByWeekday, getTopCustomers, getTopProducts } from '@/actions/reports';
import { getInventorySummary, getReorderSuggestions, type InventorySummary, type ReorderSuggestions } from '@/actions/inventory';
import { getCompany } from '@/lib/get-company';
import { fmtInr } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { addDays, daysBetween, resolveDashboardRange } from '@/lib/dashboard-period';
import { StockStatusBadge } from '@/components/inventory/stock-badges';
import { StatusBadge } from '@/components/ui/status-badge';
import { SalesCollectionsChart } from '@/components/dashboard/sales-collections-chart';
import { SalesTarget } from '@/components/dashboard/sales-target';
import { DueSoonCard } from '@/components/dashboard/due-soon-card';
import { FigureGroups, periodGroups, totalsGroup } from '@/components/dashboard/figure-groups';
import { DashboardDateFilter } from '@/components/dashboard/date-filter';
import { RecordPaymentLauncher } from '@/components/dashboard/record-payment-launcher';
import { DraftsToggle } from '@/components/dashboard/drafts-toggle';
import { RunningTotalChart } from '@/components/dashboard/running-total-chart';
import { PaymentModesBar, WeekdayChart } from '@/components/dashboard/dashboard-charts';
import { getAppSettings } from '@/lib/settings';
import { customerDisplayName } from '@/lib/customer';
import { cn } from '@/lib/utils';
import { loadSetupChecklist } from '@/lib/setup-checklist';
import { SetupChecklist } from '@/components/onboarding/setup-checklist';

export const dynamic = 'force-dynamic';

// The dashboard reads top to bottom, each thing shown once:
//   1. Date-wise summary — a date filter (today, week, month, quarter, half
//      year, full year, all time, or any custom range) and twelve figures
//      for those dates against the period before (not for all time), in four groups (payments, invoices
//      & billing, products & customers, buying & margin), then the charts
//      that explain them: the running total against the period before, how
//      customers paid, sales & collections over time, the busiest weekdays,
//      and the top customers, products and routes.
//   2. Business totals — all time, up to today: products, customers,
//      suppliers and invoices (with what's still owed). Not date-filtered.
//   3. Day to day — due this week, recent invoices, stock.
// Things that need doing (overdue, unsent drafts, stock alerts) are in the
// top bar's notifications.

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string; drafts?: string }> }) {
  const params = await searchParams;
  // Off by default: the actual position, sent and paid invoices only (as
  // Reports counts). On adds drafts into the Payments flow.
  const includeDrafts = params.drafts === '1';
  const today = todayIst();
  // All time starts at the first invoice, purchase or payment.
  const firstDate = params.period === 'all' ? await getFirstActivityDate() : null;
  const range = resolveDashboardRange(params, today, firstDate);
  const filter = { dateFrom: range.from, dateTo: range.to };
  // A weekday pattern needs a couple of weeks to mean anything; shorter
  // periods show the last 12 weeks instead (and say so).
  const days = daysBetween(range.from, range.to) + 1;
  const weekdayFilter = days >= 14 ? filter : { dateFrom: addDays(today, -83), dateTo: today };

  // The new-company setup card — owners only, gone once done or hidden.
  const checklist = await loadSetupChecklist().catch(() => null);
  const [company, overview, kpis, trend, recent, dueSoon, settings, stock, reorder, openInvoices, topCustomers, topProducts, routes, running, modes, weekdays] = await Promise.all([
    getCompany(),
    getBusinessOverview(),
    getDashboardKpis(range),
    getSalesCollectionsTrend(range.from, range.to),
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
    getRunningTotals(range),
    getPaymentModes(range.from, range.to),
    getSalesByWeekday(weekdayFilter),
  ]);

  const cur = company.currency;
  const productCount = overview.products.active + overview.products.inactive;
  const isBrandNew = productCount === 0 && overview.customers.active + overview.customers.inactive === 0 && overview.invoices.total === 0;
  const todayText = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const extended = trend.points.length > days;
  const paymentCount = modes.reduce((sum, m) => sum + m.count, 0);
  // One line on the weekday pattern: the best day and the quietest.
  const selling = weekdays.filter((w) => w.days > 0);
  const best = selling.reduce<(typeof weekdays)[number] | null>((a, w) => (!a || w.average > a.average ? w : a), null);
  const quiet = selling.reduce<(typeof weekdays)[number] | null>((a, w) => (!a || w.average < a.average ? w : a), null);
  const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdayNote =
    best && best.average > 0 && quiet && quiet.dow !== best.dow
      ? `${DAY[best.dow - 1]} is your best day, about ${fmtInr(best.average, cur)} on average; ${DAY[quiet.dow - 1]} is the quietest${quiet.average > 0 ? ` (${fmtInr(quiet.average, cur)})` : ', with no sales'}.`
      : null;
  const trendNote = extended ? `Last ${trend.points.length} days` : `${trend.granularity === 'day' ? 'By day' : trend.granularity === 'week' ? 'By week' : 'By month'} · ${range.word}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-extrabold text-ink">{greeting()}</h1>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {company.name} · {todayText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DraftsToggle on={includeDrafts} />
          <RecordPaymentLauncher invoices={openInvoices} currency={cur} />
          <HeaderLink href="/reports/loading-sheet" icon={<Truck size={14} />} label="Loading sheet" />
          <HeaderLink href="/reports" icon={<Receipt size={14} />} label="Reports" />
        </div>
      </div>

      {checklist && <SetupChecklist initial={checklist} />}

      {isBrandNew && !checklist && <GettingStarted />}

      <Section
        title="Date-wise summary"
        subtitle={range.compare ? `${range.dates} · ${range.name} — compared with ${range.previousLabel}` : `${range.dates} · All time — every invoice, purchase and payment so far`}
        action={<DashboardDateFilter key={`${range.preset}:${range.from}:${range.to}`} range={range} today={today} />}
      >
        <FigureGroups
          groups={periodGroups(kpis, {
            currency: cur,
            previous: range.previousLabel,
            topProduct: topProducts.byValue[0]?.name ?? null,
            includeDrafts,
            compare: range.compare,
            targetFooter: range.monthDays ? (
              <SalesTarget target={settings.monthlySalesTarget} netSales={kpis.current.netSales} days={range.monthDays} currency={cur} />
            ) : undefined,
            spark: trend.points.length > 1 ? { sales: trend.points.map((t) => t.sales), collected: trend.points.map((t) => t.collected) } : undefined,
          })}
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Sales so far" subtitle={`Running total · ${range.word}`} action={{ href: '/reports', label: 'Reports' }}>
            <div className="px-4 pb-3 pt-1">
              <RunningTotalChart current={running.current} previous={running.previous} currency={cur} previousName={range.previousLabel.replace(/ \(.*\)$/, '')} compare={range.compare} />
            </div>
          </Card>
          <Card title="How customers paid" subtitle={range.word} action={{ href: '/reports?tab=collections', label: 'Collections' }}>
            {modes.length === 0 ? (
              <Empty>No money received on these dates.</Empty>
            ) : (
              <div className="flex h-full flex-col px-4 pb-4 pt-2">
                <p className="mb-3 text-[12px] text-ink-soft">
                  <b className="font-mono text-[15px] text-ink">{fmtInr(kpis.current.collected, cur)}</b> received
                </p>
                <PaymentModesBar modes={modes} currency={cur} />
                <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
                  <MiniStat label="Payments" value={String(paymentCount)} />
                  <MiniStat label="Average payment" value={fmtInr(kpis.current.collected / Math.max(paymentCount, 1), cur)} />
                  <MiniStat label="Largest payment" value={fmtInr(Math.max(...modes.map((m) => m.largest)), cur)} />
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Sales & collections" subtitle={trendNote} action={{ href: '/reports', label: 'Reports' }}>
            <div className="px-4 pb-3 pt-1">
              <SalesCollectionsChart data={trend.points} granularity={trend.granularity} currency={cur} />
            </div>
          </Card>
          <Card title="Busiest days" subtitle={days >= 14 ? `Average per weekday · ${range.word}` : 'Average per weekday · last 12 weeks'} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
            <div className="px-4 pb-4 pt-1">
              <WeekdayChart points={weekdays} currency={cur} />
              {weekdayNote && <p className="mt-3 rounded-lg2 bg-bg px-3 py-2 text-[12px] leading-snug text-ink-soft">{weekdayNote}</p>}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Top customers" subtitle={range.word} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
            {topCustomers.length === 0 ? (
              <Empty>No invoices issued on these dates.</Empty>
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
          <Card title="Top products" subtitle={`${range.word}, by sales value`} action={{ href: '/reports?tab=sales', label: 'Sales analysis' }}>
            {topProducts.byValue.length === 0 ? (
              <Empty>No products sold on these dates.</Empty>
            ) : (
              <RankTable rows={topProducts.byValue.map((t) => ({ key: t.key, name: t.name, sub: t.qtyLabel, value: t.revenue }))} currency={cur} />
            )}
          </Card>
          <Card title="Sales by route" subtitle={range.word} action={{ href: '/reports/loading-sheet', label: 'Loading sheet' }}>
            {routes.total <= 0.004 ? (
              <Empty>No invoices issued on these dates.</Empty>
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

      <Section title="Business totals" subtitle="All time, up to today — the date filter doesn't change these.">
        <FigureGroups groups={[totalsGroup(overview, cur)]} />
      </Section>

      <Section title="Day to day" subtitle="What's due this week, the latest invoices, and stock to reorder.">
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

/** A titled band of the dashboard — h2, one line on what it covers, and
 * an optional control on the right (the date filter). */
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
