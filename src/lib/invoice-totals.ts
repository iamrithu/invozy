import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { computeTotals, type TotalsResult } from './gst';
import { currentCompanyId } from './tenant';

/** Anything shaped like an Invoice row with its items + customer state —
 * Prisma rows (Decimal fields) and plain numbers both work. */
type InvoiceForTotals = {
  items: { qty: unknown; rate: unknown; discount: unknown }[];
  overallDiscountType: 'PERCENT' | 'FLAT';
  overallDiscountValue: unknown;
  cgstRate: unknown;
  sgstRate: unknown;
  igstRate: unknown;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  customer: { state: string };
};

/** computeTotals() for a stored invoice, always from the invoice's own
 * frozen GST snapshot (never live Company rates — see schema.prisma's
 * Invoice.cgstRate comment). */
export function computeInvoiceTotals(inv: InvoiceForTotals, companyState: string): TotalsResult {
  return computeTotals(
    inv.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) })),
    { type: inv.overallDiscountType, value: Number(inv.overallDiscountValue) },
    {
      cgstRate: Number(inv.cgstRate),
      sgstRate: Number(inv.sgstRate),
      igstRate: Number(inv.igstRate),
      cgstEnabled: inv.cgstEnabled,
      sgstEnabled: inv.sgstEnabled,
      igstEnabled: inv.igstEnabled,
    },
    companyState,
    inv.customer.state
  );
}

/** The stored-totals columns on Invoice (see schema.prisma) for one
 * computeTotals() result — spread into every invoice create/update. */
export function totalsColumns(t: TotalsResult) {
  return { taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: t.igst, total: t.total, interState: t.useIgst };
}

/** Re-derives the stored totals for every invoice matching `where`. Only
 * needed when an input computeTotals() reads from *outside* the invoice row
 * changes — the company's state or a customer's state, which together
 * decide IGST vs CGST+SGST. Everything else is snapshotted on the invoice
 * and rewritten by the action that changes it. */
export async function recomputeStoredTotals(where: Prisma.InvoiceWhereInput, companyState: string) {
  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      overallDiscountType: true,
      overallDiscountValue: true,
      cgstRate: true,
      sgstRate: true,
      igstRate: true,
      cgstEnabled: true,
      sgstEnabled: true,
      igstEnabled: true,
      customer: { select: { state: true } },
      items: { select: { qty: true, rate: true, discount: true } },
    },
  });
  const BATCH = 100;
  for (let i = 0; i < invoices.length; i += BATCH) {
    await prisma.$transaction(
      invoices
        .slice(i, i + BATCH)
        .map((inv) => prisma.invoice.update({ where: { id: inv.id }, data: totalsColumns(computeInvoiceTotals(inv, companyState)) }))
    );
  }
}

/** Σ max(total − paid, 0) across one customer's invoices — the credit-limit
 * check's "outstanding before this invoice". `excludeInvoiceId` leaves out
 * the invoice being edited so its old total isn't double-counted. */
export async function customerOutstanding(customerId: string, excludeInvoiceId?: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ outstanding: unknown }[]>`
    SELECT COALESCE(SUM(GREATEST(total - "amountPaid", 0)), 0) AS outstanding
    FROM "Invoice"
    WHERE "companyId" = ${await currentCompanyId()} AND "customerId" = ${customerId} ${excludeInvoiceId ? Prisma.sql`AND id <> ${excludeInvoiceId}` : Prisma.empty}
  `;
  return Number(rows[0]?.outstanding ?? 0);
}
