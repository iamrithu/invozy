import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import { exportFileName } from '@/lib/csv';
import { customerDisplayName } from '@/lib/customer';
import { buildTallyMastersXml, buildTallyVouchersXml, resolveTallyLedgers, type TallyDoc, type TallyParty } from '@/lib/tally';
import { ownerGate, parseRange } from '../export-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Tally import files for the Reports date range (owner only):
 *
 * - `/api/export/tally?from&to` — one Sales voucher per issued (non-draft)
 *   invoice and one Credit Note voucher per credit note.
 *   Tally: Gateway of Tally → Import → Vouchers.
 * - `…&part=masters` — the ledgers those vouchers post to: the six
 *   sales/tax ledgers (names from Company.tallyLedgers) and one Sundry
 *   Debtors ledger per customer in the range. Tally: Import → Masters,
 *   before the vouchers.
 *
 * Built in memory rather than streamed: a month is a few hundred vouchers,
 * and XML that stops halfway is worse than a clear error.
 */
export async function GET(req: NextRequest) {
  const denied = await ownerGate();
  if (denied) return denied;

  const range = parseRange(req.nextUrl);
  const mastersOnly = req.nextUrl.searchParams.get('part') === 'masters';
  const dateWhere = range.dateWhere ? { date: range.dateWhere } : {};

  try {
    const customerSelect = { name: true, shopName: true, gstin: true, state: true, address: true, pincode: true } as const;
    const [company, invoices, creditNotes] = await Promise.all([
      prisma.company.findUnique({ where: { id: COMPANY_ID }, select: { tallyLedgers: true } }),
      prisma.invoice.findMany({
        where: { status: { not: 'DRAFT' }, ...dateWhere },
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: { id: true, number: true, date: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, notes: true, customer: { select: customerSelect } },
      }),
      prisma.creditNote.findMany({
        where: dateWhere,
        orderBy: [{ date: 'asc' }, { number: 'asc' }],
        select: {
          id: true, number: true, date: true, taxable: true, cgst: true, sgst: true, igst: true, total: true, reason: true, invoiceNumber: true,
          invoice: { select: { number: true } },
          customer: { select: customerSelect },
        },
      }),
    ]);
    const ledgers = resolveTallyLedgers(company?.tallyLedgers);

    const party = (c: { name: string; shopName: string | null; gstin: string | null; state: string; address: string | null; pincode: string | null }): TallyParty => ({
      name: customerDisplayName(c).trim(),
      gstin: c.gstin?.trim() || null,
      state: c.state,
      address: c.address,
      pincode: c.pincode,
    });

    let xml: string;
    if (mastersOnly) {
      xml = buildTallyMastersXml({ ledgers, parties: [...invoices, ...creditNotes].map((d) => party(d.customer)) });
    } else {
      const invoiceDocs: TallyDoc[] = invoices.map((i) => ({
        id: i.id,
        number: i.number,
        date: i.date,
        party: party(i.customer),
        taxable: Number(i.taxable),
        cgst: Number(i.cgst),
        sgst: Number(i.sgst),
        igst: Number(i.igst),
        total: Number(i.total),
        narration: [`Invoice ${i.number}`, i.notes?.trim()].filter(Boolean).join(' — '),
      }));
      const creditDocs: TallyDoc[] = creditNotes.map((c) => {
        const against = c.invoice?.number ?? c.invoiceNumber;
        return {
          id: c.id,
          number: c.number,
          date: c.date,
          party: party(c.customer),
          taxable: Number(c.taxable),
          cgst: Number(c.cgst),
          sgst: Number(c.sgst),
          igst: Number(c.igst),
          total: Number(c.total),
          againstInvoice: against,
          narration: [`Credit note ${c.number}`, against ? `against ${against}` : null, c.reason?.trim()].filter(Boolean).join(' — '),
        };
      });
      xml = buildTallyVouchersXml({ invoices: invoiceDocs, creditNotes: creditDocs, ledgers });
    }

    const fileName = exportFileName(mastersOnly ? 'tally-ledgers' : 'tally-vouchers', range, 'xml');
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('Tally export failed', e);
    return Response.json({ error: 'Could not prepare the Tally file. Please try again.' }, { status: 500 });
  }
}
