import { Receipt, Percent, TrendingUp, Wallet, Users, BarChart3 } from 'lucide-react';
import { getBillingTrend, getReportStats, getTopCustomers } from '@/actions/reports';
import { getCompany } from '@/lib/get-company';
import { fmtInr } from '@/lib/gst';
import { BillingTrendChart } from '@/components/charts/billing-trend-chart';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const [company, trend, stats, topCustomers] = await Promise.all([getCompany(), getBillingTrend(6), getReportStats(), getTopCustomers()]);
  const totalTax = stats.cgst + stats.sgst + stats.igst;

  const statCards = [
    { icon: <Receipt size={14} />, label: 'Taxable value', value: fmtInr(stats.taxable, company.currency) },
    { icon: <Percent size={14} />, label: 'CGST + SGST', value: fmtInr(stats.cgst + stats.sgst, company.currency) },
    { icon: <Percent size={14} />, label: 'IGST', value: fmtInr(stats.igst, company.currency) },
    { icon: <TrendingUp size={14} />, label: 'Total billed', value: fmtInr(stats.total, company.currency) },
    { icon: <Wallet size={14} />, label: 'Outstanding', value: fmtInr(stats.outstanding, company.currency) },
  ];

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-[20px] font-extrabold text-ink">
        <BarChart3 size={18} className="text-brand" /> Reports
      </h1>
      <p className="mb-4 text-[12.5px] text-ink-faint">Sent and paid invoices only — drafts aren&apos;t counted until they go out.</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl2 border border-line bg-surface p-3 shadow-card transition-colors hover:border-brand/50">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">{s.icon}</div>
            <div className="mt-2 font-mono text-[16.5px] font-extrabold text-ink">{s.value}</div>
            <div className="mt-0.5 text-[11px] text-ink-faint">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-ink">
            <TrendingUp size={14} className="text-brand" /> Billing trend — last 6 months
          </div>
          <BillingTrendChart data={trend} />
        </div>

        <div className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
          <div className="mb-3 flex items-center gap-2 text-[13px] font-extrabold text-ink">
            <Receipt size={14} className="text-brand" /> Tax composition
          </div>
          {totalTax <= 0 ? (
            <p className="py-8 text-center text-[12.5px] text-ink-faint">No tax collected yet.</p>
          ) : (
            <div className="flex items-center gap-5">
              <TaxDonut cgst={stats.cgst} sgst={stats.sgst} igst={stats.igst} currency={company.currency} />
              <div className="flex-1 space-y-2">
                {stats.cgst > 0 && <Legend color="hsl(var(--brand))" label="CGST" value={fmtInr(stats.cgst, company.currency)} />}
                {stats.sgst > 0 && <Legend color="hsl(var(--gold))" label="SGST" value={fmtInr(stats.sgst, company.currency)} />}
                {stats.igst > 0 && <Legend color="hsl(var(--green))" label="IGST" value={fmtInr(stats.igst, company.currency)} />}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-extrabold text-ink">
          <Users size={14} className="text-brand" /> Top customers by billing
        </div>
        <div className="rounded-xl2 border border-line bg-surface shadow-card">
          {topCustomers.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-ink-faint">No billing data yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Invoices</TableHead>
                  <TableHead className="text-right">Total billed</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-bold text-ink">{c.name}</TableCell>
                    <TableCell className="text-ink-soft">{c.state}</TableCell>
                    <TableCell className="text-ink-soft">{c.count}</TableCell>
                    <TableCell className="text-right font-mono font-bold">{fmtInr(c.total, company.currency)}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${c.balance > 0 ? 'text-red' : 'text-green'}`}>{fmtInr(c.balance, company.currency)}</TableCell>
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

function TaxDonut({ cgst, sgst, igst, currency }: { cgst: number; sgst: number; igst: number; currency?: string }) {
  const total = cgst + sgst + igst;
  const R = 46,
    C = 2 * Math.PI * R,
    cx = 60,
    cy = 60;
  const gap = 3;
  const segs = [
    { val: cgst, color: 'hsl(var(--brand))' },
    { val: sgst, color: 'hsl(var(--gold))' },
    { val: igst, color: 'hsl(var(--green))' },
  ].filter((s) => s.val > 0);
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-[120px] w-[120px] flex-shrink-0">
      {segs.map((s, i) => {
        const len = Math.max((s.val / total) * C - gap, 0);
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += (s.val / total) * C;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="hsl(var(--ink-faint))">
        Total tax
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="12" fontWeight="bold" fill="hsl(var(--ink))">
        {fmtInr(total, currency)}
      </text>
    </svg>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm2" style={{ background: color }} />
      <span className="flex-1 text-ink-soft">{label}</span>
      <span className="font-mono font-bold text-ink">{value}</span>
    </div>
  );
}
