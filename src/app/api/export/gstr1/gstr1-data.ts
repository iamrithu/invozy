import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import type { Gstr1Data, Gstr1Doc } from '@/lib/gstr1';
import type { ExportRange } from '../export-utils';

// Loads the period's issued invoices and credit notes in the shape
// src/lib/gstr1.ts builds the GSTR-1 sections from. Server-only; the
// route is owner-gated before this runs.

const num = (v: unknown) => Number(v ?? 0);

/** The document's GST rate as GSTR-1 reports it — IGST for an inter-state
 * supply, else CGST + SGST — from the rates saved on it. Falls back to the
 * stored tax ÷ taxable when the saved rates say 0 but tax was charged
 * (credit notes raised before their rates were stored). */
function rateOf(d: { interState: boolean; taxable: unknown; cgst: unknown; sgst: unknown; igst: unknown }, saved: number): number {
  if (saved > 0) return saved;
  const taxable = num(d.taxable);
  const tax = num(d.cgst) + num(d.sgst) + num(d.igst);
  return taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0;
}

export async function loadGstr1Data(range: ExportRange): Promise<Gstr1Data> {
  const dateWhere = range.dateWhere ? { date: range.dateWhere } : {};
  const party = { select: { name: true, shopName: true, gstin: true, state: true } } as const;
  const [company, invoices, creditNotes, invoiceNumbers, creditNoteNumbers] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID }, select: { defaultHsn: true } }),
    prisma.invoice.findMany({
      where: { status: { not: 'DRAFT' }, ...dateWhere },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
      select: {
        number: true,
        date: true,
        total: true,
        taxable: true,
        cgst: true,
        sgst: true,
        igst: true,
        interState: true,
        cgstRate: true,
        sgstRate: true,
        igstRate: true,
        cgstEnabled: true,
        sgstEnabled: true,
        igstEnabled: true,
        customer: party,
        items: { select: { hsn: true, name: true, unit: true, qty: true, rate: true, discount: true, product: { select: { hsn: true } } } },
      },
    }),
    prisma.creditNote.findMany({
      where: dateWhere,
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
      select: {
        number: true,
        date: true,
        total: true,
        taxable: true,
        cgst: true,
        sgst: true,
        igst: true,
        interState: true,
        cgstRate: true,
        sgstRate: true,
        igstRate: true,
        customer: party,
        items: { select: { hsn: true, name: true, unit: true, qty: true, rate: true, discount: true, creditPct: true, product: { select: { hsn: true } } } },
      },
    }),
    // Just the numbers, for the Docs section's cancelled count.
    prisma.invoice.findMany({ where: { status: { not: 'DRAFT' } }, select: { number: true } }),
    prisma.creditNote.findMany({ select: { number: true } }),
  ]);

  // A line's own HSN, else its product's, else the company default — the
  // same order the printed invoice uses.
  const hsnOf = (l: { hsn: string | null; product: { hsn: string | null } | null }) => l.hsn?.trim() || l.product?.hsn?.trim() || company.defaultHsn;
  const base = (d: (typeof invoices)[number] | (typeof creditNotes)[number]) => ({
    number: d.number,
    date: d.date,
    total: num(d.total),
    taxable: num(d.taxable),
    cgst: num(d.cgst),
    sgst: num(d.sgst),
    igst: num(d.igst),
    interState: d.interState,
    party: d.customer,
  });

  return {
    issuedNumbers: { invoices: invoiceNumbers.map((d) => d.number), creditNotes: creditNoteNumbers.map((d) => d.number) },
    invoices: invoices.map(
      (d): Gstr1Doc => ({
        ...base(d),
        rate: rateOf(d, d.interState ? (d.igstEnabled ? num(d.igstRate) : 0) : (d.cgstEnabled ? num(d.cgstRate) : 0) + (d.sgstEnabled ? num(d.sgstRate) : 0)),
        lines: d.items.map((l) => ({ hsn: hsnOf(l), name: l.name, unit: l.unit, qty: num(l.qty), value: num(l.qty) * num(l.rate) * (1 - num(l.discount) / 100) })),
      })
    ),
    creditNotes: creditNotes.map(
      (d): Gstr1Doc => ({
        ...base(d),
        rate: rateOf(d, d.interState ? num(d.igstRate) : num(d.cgstRate) + num(d.sgstRate)),
        lines: d.items.map((l) => ({
          hsn: hsnOf(l),
          name: l.name,
          unit: l.unit,
          qty: num(l.qty),
          value: num(l.qty) * num(l.rate) * (1 - num(l.discount) / 100) * (num(l.creditPct) / 100),
        })),
      })
    ),
  };
}
