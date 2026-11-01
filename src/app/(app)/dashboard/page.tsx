import Link from 'next/link';
import { AlertTriangle, TrendingUp, Wallet, CheckCircle2, Package, Users, ArrowRight, Clock, Plus, BarChart3, Receipt, Building2, Tag, Boxes, CalendarClock, Truck } from 'lucide-react';
import { getDashboardStats, getBillingTrend, getCollectedTrend, getMonthOverMonth, getTopCustomers } from '@/actions/reports';
import { getFrequentCustomItems } from '@/actions/products';
import { getInventorySummary, type InventorySummary } from '@/actions/inventory';
import { getCompany } from '@/lib/get-company';
import { fmtInr } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { SoftBadge, StockStatusBadge } from '@/components/inventory/stock-badges';
import { expiryText } from '@/components/inventory/stock-meta';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sparkline } from '@/components/ui/sparkline';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { hashColor, initials } from '@/lib/avatar';
import { customerDisplayName } from '@/lib/customer';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [company, stats, invoicedTrend, collectedTrend, mom, topCustomers, frequentCustomItems, stock] = await Promise.all([
    getCompany(),
    getDashboardStats(),
    getBillingTrend(),
    getCollectedTrend(6),
    getMonthOverMonth(),
    getTopCustomers(undefined, 10),
    getFrequentCustomItems(),
    // The stock cards are extras — if they fail, the rest of the dashboard
    // still renders without them.
    getInventorySummary().catch((err) => {
      console.error('inventory summary failed', err);
      return null;
    }),
  ]);

  const pct = mom.lastMonthTotal > 0 ? ((mom.thisMonthTotal - mom.lastMonthTotal) / mom.lastMonthTotal) * 100 : null;
  const momTrend: 'up' | 'down' | 'flat' = pct === null ? (mom.thisMonthTotal > 0 ? 'up' : 'flat') : pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const momText = pct === null ? (mom.thisMonthTotal > 0 ? 'New activity this month' : 'No billing yet') : `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs last month`;

  const quickAccess = topCustomers;
  const isBrandNew = stats.activeProducts === 0 && stats.customerCount === 0 && stats.recent.length === 0;
  const profileIncomplete = !company.gstin || !company.bankAcc;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">{greeting()}, {company.name}</h1>
        <p className="mt-0.5 text-[12px] text-ink-faint">
          Press <b className="font-mono">N</b> for a new invoice, or <b className="font-mono">⌘K</b> to jump anywhere.
        </p>
      </div>

      {isBrandNew && <GettingStarted />}

      {!isBrandNew && profileIncomplete && (
        <Link
          href="/company"
          className="flex items-center gap-3 rounded-lg2 border border-gold bg-gold-soft p-3 transition-colors hover:border-gold/60"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-gold text-white">
            <Building2 size={16} />
          </span>
          <div className="flex-1">
            <div className="text-[13.5px] font-extrabold text-ink">Your company profile isn&apos;t fully set up</div>
            <div className="mt-0.5 text-[12px] text-ink-soft">
              Add your {!company.gstin && 'GSTIN'}
              {!company.gstin && !company.bankAcc && ' and '}
              {!company.bankAcc && 'bank details'} so invoices print complete.
            </div>
          </div>
          <ArrowRight size={15} className="flex-shrink-0 text-ink-soft" />
        </Link>
      )}

      {frequentCustomItems.length > 0 && (
        <Link
          href={`/products?addName=${encodeURIComponent(frequentCustomItems[0].name)}&addUnit=${encodeURIComponent(frequentCustomItems[0].unit)}&addRate=${frequentCustomItems[0].rate}`}
          className="flex items-center gap-3 rounded-lg2 border border-gold bg-gold-soft p-3 transition-colors hover:border-gold/60"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-gold text-white">
            <Tag size={16} />
          </span>
          <div className="flex-1">
            <div className="text-[13.5px] font-extrabold text-ink">
              You&apos;ve billed &quot;{frequentCustomItems[0].name}&quot; {frequentCustomItems[0].count} times without adding it to your catalog
            </div>
            <div className="mt-0.5 text-[12px] text-ink-soft">Add it once and it&apos;ll show up in search next time — no more retyping.</div>
          </div>
          <ArrowRight size={15} className="flex-shrink-0 text-ink-soft" />
        </Link>
      )}

      {stats.overdueCount > 0 && (
        <Link
          href="/invoices?status=all"
          className="flex items-center gap-3 rounded-lg2 border border-red bg-red-soft p-3 transition-colors hover:border-red/60"
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-red text-white">
            <AlertTriangle size={16} />
          </span>
          <div className="flex-1">
            <div className="text-[13.5px] font-extrabold text-ink">
              {stats.overdueCount} invoice{stats.overdueCount !== 1 ? 's' : ''} overdue
            </div>
            <div className="mt-0.5 text-[12px] text-ink-soft">{fmtInr(stats.overdueTotal, company.currency)} outstanding past the due date — take a look</div>
          </div>
          <ArrowRight size={15} className="flex-shrink-0 text-red" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
        <StatCard icon={<TrendingUp size={14} />} label="Total invoiced" value={fmtInr(stats.totalInvoiced, company.currency)} spark={invoicedTrend.map((t) => t.billed)} />
        <StatCard icon={<Wallet size={14} />} label="Outstanding" value={fmtInr(stats.outstanding, company.currency)} />
        <StatCard icon={<CheckCircle2 size={14} />} label="Collected" value={fmtInr(stats.collected, company.currency)} spark={collectedTrend.map((t) => t.total)} color="hsl(var(--green))" />
        <StatCard icon={<Package size={14} />} label="Active products" value={String(stats.activeProducts)} />
        <StatCard icon={<Users size={14} />} label="Customers" value={String(stats.customerCount)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_7fr]">
        <div className="flex flex-wrap items-center gap-4 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-brand/50 md:flex-nowrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{mom.thisMonthLabel}</span>
            <span className="font-mono text-[16px] font-extrabold text-ink">{fmtInr(mom.thisMonthTotal, company.currency)}</span>
          </div>
          <div className="h-7 w-px flex-shrink-0 bg-line" />
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">{mom.lastMonthLabel}</span>
            <span className="font-mono text-[16px] font-extrabold text-ink">{fmtInr(mom.lastMonthTotal, company.currency)}</span>
          </div>
          <span
            className={`ml-auto flex items-center gap-1.5 rounded-sm2 px-3 py-1.5 text-[12px] font-extrabold ${
              momTrend === 'up' ? 'bg-green-soft text-green' : momTrend === 'down' ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'
            }`}
          >
            <TrendingUp size={12} className={momTrend === 'down' ? 'rotate-180 scale-y-[-1]' : ''} /> {momText}
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <QuickPill href="/invoices/new" icon={<Plus size={13} />} label="New invoice" />
          <QuickPill href="/products" icon={<Package size={13} />} label="Add product" />
          <QuickPill href="/customers" icon={<Users size={13} />} label="Add customer" />
          <QuickPill href="/reports" icon={<BarChart3 size={13} />} label="View reports" />
          <QuickPill href="/reports/loading-sheet" icon={<Truck size={13} />} label="Today's loading sheet" />
        </div>
      </div>

      {stock && stock.tracked > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LowStockCard stock={stock} currency={company.currency} />
          {stock.expiringCount > 0 && <ExpiringCard stock={stock} alertDays={company.expiryAlertDays} />}
        </div>
      ) : (
        stock &&
        !isBrandNew &&
        stats.activeProducts > 0 && (
          // Every product starts untracked — one quiet line points at where
          // tracking starts, instead of an empty stock card.
          <Link
            href="/inventory"
            className="flex items-center gap-3 rounded-lg2 border border-line bg-surface p-3 shadow-card transition-colors hover:border-brand/50"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
              <Boxes size={16} />
            </span>
            <div className="flex-1">
              <div className="text-[13.5px] font-extrabold text-ink">Keep track of your stock</div>
              <div className="mt-0.5 text-[12px] text-ink-soft">Count each product once on the Inventory screen — sent and paid invoices keep it up to date after that.</div>
            </div>
            <ArrowRight size={15} className="flex-shrink-0 text-ink-soft" />
          </Link>
        )
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-[13.5px] font-extrabold text-ink">
          <Users size={14} className="text-brand" /> Quick access — your top customers
        </div>
        {quickAccess.length === 0 ? (
          <p className="rounded-xl2 border border-dashed border-line p-4 text-[12.5px] text-ink-faint">
            No billing history yet — your most-billed customers will show up here.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {quickAccess.map((c, i) => (
              <Link
                key={c.name + i}
                href="/customers"
                className="w-[168px] flex-shrink-0 rounded-xl2 border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-brand/50"
              >
                <div
                  className="mb-2.5 flex h-[38px] w-[38px] items-center justify-center rounded-sm2 text-[13px] font-extrabold text-white"
                  style={{ background: hashColor(customerDisplayName(c)) }}
                >
                  {initials(customerDisplayName(c))}
                </div>
                <div className="truncate text-[12.5px] font-bold text-ink">{customerDisplayName(c)}</div>
                <div className="mt-0.5 text-[11px] text-ink-faint">
                  {c.count} invoice{c.count !== 1 ? 's' : ''}
                </div>
                <div className="mt-2 font-mono text-[13px] font-bold text-brand">{fmtInr(c.total, company.currency)}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-[13.5px] font-extrabold text-ink">
          <Clock size={14} className="text-brand" /> Recent invoices
        </div>
        <div className="rounded-xl2 border border-line bg-surface shadow-card">
          {stats.recent.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-ink-faint">No invoices yet — create your first one to see it here.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 text-[11px] font-extrabold text-white"
                          style={{ background: hashColor(customerDisplayName(r.customer)) }}
                        >
                          {initials(customerDisplayName(r.customer))}
                        </span>
                        <div>
                          <Link href={`/invoices/${r.id}`} className="font-mono font-bold text-ink hover:text-brand">
                            {r.number}
                          </Link>
                          <div className="text-[11px] text-ink-faint">
                            {customerDisplayName(r.customer)} · {new Date(r.date).toLocaleDateString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} overdue={r.isOverdue} />
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-ink">{fmtInr(r.total, company.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
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
          <Link
            key={s.href}
            href={s.href}
            className="flex items-start gap-2.5 rounded-lg2 border border-line bg-surface p-3 transition-colors hover:border-brand/50"
          >
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

function StatCard({ icon, label, value, spark, color }: { icon: React.ReactNode; label: string; value: string; spark?: number[]; color?: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-3 shadow-card transition-colors hover:border-brand/50">
      <div className="flex h-7 w-7 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{icon}</div>
      <div className="mt-2 font-mono text-[16.5px] font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-ink-faint">{label}</div>
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  );
}

/** The five tracked products closest to running out (out of stock first),
 * plus the value of what's on the shelf. */
function LowStockCard({ stock, currency }: { stock: InventorySummary; currency: string }) {
  return (
    <div className="rounded-xl2 border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <Boxes size={14} className="text-brand" />
        <span className="text-[13.5px] font-extrabold text-ink">Low stock</span>
        {(stock.out > 0 || stock.low > 0) && (
          <span className="text-[11.5px] text-ink-faint">
            {[stock.out ? `${stock.out} out` : null, stock.low ? `${stock.low} low` : null].filter(Boolean).join(' · ')}
          </span>
        )}
        <Link
          href={`/inventory?status=${stock.low === 0 && stock.out > 0 ? 'out' : 'low'}`}
          className="ml-auto flex items-center gap-1 text-[12px] font-bold text-brand hover:underline"
        >
          Inventory <ArrowRight size={12} />
        </Link>
      </div>
      {stock.lowItems.length === 0 ? (
        <div className="flex items-center gap-2 px-3.5 py-4 text-[12.5px] text-ink-soft">
          <CheckCircle2 size={15} className="text-green" /> All {stock.tracked} tracked product{stock.tracked === 1 ? ' is' : 's are'} above their alert level.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {stock.lowItems.map((p) => (
            <Link key={p.id} href={`/inventory/${p.id}`} className="flex items-center gap-3 px-3.5 py-2 transition-colors hover:bg-bg">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{p.name}</span>
              <span className="flex-shrink-0 font-mono text-[12px] text-ink-soft">{p.stockText}</span>
              <StockStatusBadge status={p.status} />
            </Link>
          ))}
        </div>
      )}
      <div className="border-t border-line px-3.5 py-2 text-[11.5px] text-ink-faint">
        Stock on hand worth <b className="font-mono font-bold text-ink-soft">{fmtInr(stock.stockValue, currency)}</b>
        {stock.valuedPartlyAtPrice ? ' (at cost where known, else selling price)' : ' at cost'}
      </div>
    </div>
  );
}

/** Batches on hand that expire inside the company's alert window — sell
 * these first, or write them off. */
function ExpiringCard({ stock, alertDays }: { stock: InventorySummary; alertDays: number }) {
  const today = todayIst();
  return (
    <div className="rounded-xl2 border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <CalendarClock size={14} className="text-brand" />
        <span className="text-[13.5px] font-extrabold text-ink">Expiring soon</span>
        <span className="text-[11.5px] text-ink-faint">next {alertDays} days</span>
        <Link href="/inventory?status=expiring" className="ml-auto flex items-center gap-1 text-[12px] font-bold text-brand hover:underline">
          {stock.expiringCount > stock.expiring.length ? `All ${stock.expiringCount}` : 'View'} <ArrowRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-line">
        {stock.expiring.map((b, i) => {
          const exp = expiryText(b.expiryDate, today, alertDays);
          return (
            <Link key={`${b.productId}-${i}`} href={`/inventory/${b.productId}`} className="flex items-center gap-3 px-3.5 py-2 transition-colors hover:bg-bg">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold text-ink">{b.name}</div>
                <div className="truncate text-[11px] text-ink-faint">
                  {b.batchNo ? `Batch ${b.batchNo} · ` : ''}
                  {b.remainingText} left
                </div>
              </div>
              <SoftBadge className={exp.tone === 'red' ? 'bg-red-soft text-red' : 'bg-gold-soft text-gold'}>{exp.text}</SoftBadge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function QuickPill({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl2 border border-line bg-surface py-2.5 pl-2.5 pr-4 shadow-card transition-colors hover:border-brand/50"
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand text-white">{icon}</span>
      <span className="text-[12.5px] font-bold text-ink">{label}</span>
    </Link>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
