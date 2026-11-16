import { prisma } from './prisma';
import { currentCompanyId } from './tenant';
import { istDayRangeUtc, todayIst } from './dates';
import { fmtInr } from './gst';
import { getAppSettings } from './settings';

// The 8 AM summary email (src/app/api/cron/daily/route.ts). Runs from a
// cron with no signed-in user, so it reads the database directly instead
// of going through the session-checked server actions — read-only, and
// only the figures an owner wants with their morning tea.

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DAY_MS = 86_400_000;

export type DailyDigest = {
  date: string;
  companyName: string;
  currency: string;
  yesterday: { sales: number; invoices: number; collected: number };
  month: { netSales: number; target: number | null; elapsed: number; total: number };
  overdue: { count: number; total: number; top: { customer: string; number: string; daysLate: number; balance: number }[] };
  dueSoon: { count: number; total: number };
  draftsHoldingStock: number;
  stock: { out: number; low: number };
};

export async function buildDailyDigest(): Promise<DailyDigest> {
  const today = todayIst();
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = addDays(`${today.slice(0, 8)}28`, 4).slice(0, 7) + '-01';
  const t0 = istDayRangeUtc(today).gte;
  const y0 = istDayRangeUtc(yesterday).gte;
  const m0 = istDayRangeUtc(monthStart).gte;
  const week = istDayRangeUtc(addDays(today, 8)).gte;

  const [company, settings, [ySales], [yPaid], [mSales], [mCredits], overdue, [due], drafts, [stock]] = await Promise.all([
    prisma.company.findUnique({ where: { id: await currentCompanyId() }, select: { name: true, currency: true } }),
    getAppSettings(),
    prisma.$queryRaw<{ total: number; n: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total, COUNT(*)::int AS n FROM "Invoice" WHERE "companyId" = ${await currentCompanyId()} AND status <> 'DRAFT' AND date >= ${y0} AND date < ${t0}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::float8 AS total FROM "Payment" WHERE "companyId" = ${await currentCompanyId()} AND "creditNoteId" IS NULL AND date >= ${y0} AND date < ${t0}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total FROM "Invoice" WHERE "companyId" = ${await currentCompanyId()} AND status <> 'DRAFT' AND date >= ${m0} AND date < ${istDayRangeUtc(addDays(today, 1)).gte}`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM(total), 0)::float8 AS total FROM "CreditNote" WHERE "companyId" = ${await currentCompanyId()} AND date >= ${m0} AND date < ${istDayRangeUtc(addDays(today, 1)).gte}`,
    prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID'] }, due: { lt: t0 } },
      orderBy: [{ due: 'asc' }],
      select: { number: true, due: true, total: true, amountPaid: true, customer: { select: { name: true, shopName: true } } },
    }),
    prisma.$queryRaw<{ n: number; total: number }[]>`
      SELECT COUNT(*)::int AS n, COALESCE(SUM(total - "amountPaid"), 0)::float8 AS total
      FROM "Invoice" WHERE "companyId" = ${await currentCompanyId()} AND status IN ('SENT', 'PARTIALLY_PAID') AND due >= ${t0} AND due < ${week} AND total - "amountPaid" > 0.004`,
    prisma.invoice.count({ where: { status: 'DRAFT', stockTaken: true } }),
    prisma.$queryRaw<{ out: number; low: number }[]>`
      SELECT
        (COUNT(*) FILTER (WHERE "stockQty" <= 0.000001))::int AS out,
        (COUNT(*) FILTER (WHERE "stockQty" > 0.000001 AND "lowStockAt" IS NOT NULL AND "stockQty" <= "lowStockAt"))::int AS low
      FROM "Product" WHERE "companyId" = ${await currentCompanyId()} AND "trackStock" AND active`,
  ]);

  const owing = overdue
    .map((o) => ({
      customer: o.customer.shopName || o.customer.name,
      number: o.number,
      daysLate: Math.max(1, Math.floor((t0.getTime() - istDayRangeUtc(new Date(o.due.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)).gte.getTime()) / DAY_MS)),
      balance: Number(o.total) - Number(o.amountPaid),
    }))
    .filter((o) => o.balance > 0.004);

  return {
    date: today,
    companyName: company?.name ?? 'Your business',
    currency: company?.currency ?? 'INR',
    yesterday: { sales: ySales.total, invoices: ySales.n, collected: yPaid.total },
    month: {
      netSales: mSales.total - mCredits.total,
      target: settings.monthlySalesTarget,
      elapsed: Number(today.slice(8)),
      total: Math.round((istDayRangeUtc(nextMonth).gte.getTime() - m0.getTime()) / DAY_MS),
    },
    overdue: { count: owing.length, total: owing.reduce((s, o) => s + o.balance, 0), top: owing.slice(0, 5) },
    dueSoon: { count: due.n, total: due.total },
    draftsHoldingStock: drafts,
    stock,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Subject + HTML body. Inline styles and tables only — what every mail
 * client (Gmail app included) renders the same. */
export function renderDailyDigest(d: DailyDigest, appUrl: string, monthlyReportAttached = false): { subject: string; html: string } {
  const m = (n: number) => fmtInr(n, d.currency);
  const day = new Date(`${d.date}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const subject = `${d.companyName} · ${day}: ${m(d.yesterday.sales)} billed yesterday${d.overdue.count ? `, ${d.overdue.count} overdue` : ''}`;

  const stat = (label: string, value: string, sub = '') => `
    <td style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top;width:33%">
      <div style="font-size:12px;color:#6b7280">${label}</div>
      <div style="font-size:20px;font-weight:700;color:#111827;margin-top:2px">${value}</div>
      ${sub ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
    </td>`;

  const target = d.month.target
    ? `${Math.round((d.month.netSales / d.month.target) * 100)}% of ${m(d.month.target)} target`
    : 'No monthly target set';

  const alerts: string[] = [];
  if (d.overdue.count) {
    alerts.push(`
      <div style="font-weight:700;color:#b91c1c">${d.overdue.count} invoice${d.overdue.count === 1 ? '' : 's'} overdue · ${m(d.overdue.total)}</div>
      <table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:13px">
        ${d.overdue.top
          .map(
            (o) => `<tr>
              <td style="padding:4px 0;color:#111827">${esc(o.customer)} <span style="color:#6b7280">· ${esc(o.number)} · ${o.daysLate} day${o.daysLate === 1 ? '' : 's'} late</span></td>
              <td style="padding:4px 0;text-align:right;font-family:monospace;color:#111827">${m(o.balance)}</td>
            </tr>`
          )
          .join('')}
      </table>`);
  }
  if (d.dueSoon.count) alerts.push(`<div><b>${d.dueSoon.count}</b> invoice${d.dueSoon.count === 1 ? '' : 's'} due in the next 7 days · ${m(d.dueSoon.total)}</div>`);
  if (d.draftsHoldingStock) alerts.push(`<div><b>${d.draftsHoldingStock}</b> draft${d.draftsHoldingStock === 1 ? ' is' : 's are'} holding stock — send or delete them</div>`);
  if (d.stock.out || d.stock.low) alerts.push(`<div>Stock: ${[d.stock.out ? `<b>${d.stock.out}</b> out of stock` : '', d.stock.low ? `<b>${d.stock.low}</b> running low` : ''].filter(Boolean).join(' · ')}</div>`);

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#e23645;color:#fff;border-radius:10px 10px 0 0;padding:16px 20px">
      <div style="font-size:13px;opacity:.85">Good morning</div>
      <div style="font-size:18px;font-weight:700">${esc(d.companyName)} — ${day}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 10px 10px;padding:18px 20px;color:#374151;font-size:14px;line-height:1.5">
      <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px"><tr>
        ${stat('Billed yesterday', m(d.yesterday.sales), `${d.yesterday.invoices} invoice${d.yesterday.invoices === 1 ? '' : 's'}`)}
        ${stat('Collected yesterday', m(d.yesterday.collected))}
        ${stat('This month so far', m(d.month.netSales), target)}
      </tr></table>
      <div style="margin-top:18px;font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.04em">Needs attention</div>
      <div style="margin-top:8px;display:block">${alerts.length ? alerts.map((a) => `<div style="padding:10px 0;border-top:1px solid #f0f0f0">${a}</div>`).join('') : '<div style="padding:10px 0;color:#15803d">Nothing overdue, nothing stuck — all clear.</div>'}</div>
      ${monthlyReportAttached ? '<div style="margin-top:12px;padding:10px 12px;background:#f3f4f6;border-radius:8px;font-size:13px">Last month\'s report is attached as a PDF.</div>' : ''}
      <div style="margin-top:18px"><a href="${esc(appUrl)}/dashboard" style="display:inline-block;background:#e23645;color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:6px;font-size:13px">Open the dashboard</a></div>
      <div style="margin-top:16px;font-size:11.5px;color:#9ca3af">You get this because daily summaries are on for your login. Turn it off from the bell icon in the app.</div>
    </div>
  </div></body></html>`;
  return { subject, html };
}
