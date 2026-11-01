// Server-only: one credit note shaped for printing / on-screen preview.
// Not auth-checked and not a 'use server' module — the /print page calls
// it after verifying its signed token, /credit-notes/[id] after
// requireUser(). Never import this from a client component.

import { prisma } from '@/lib/prisma';
import type { BuyerInfo } from '@/components/print/clean-doc';
import { BUYER_SELECT, toBuyerInfo } from '@/components/print/print-data';
import { istDateString } from '@/components/print/format';

export type CreditNoteDoc = {
  id: string;
  number: string;
  date: string;
  reason: string | null;
  restock: boolean;
  /** The original invoice — `id` is null once that invoice was deleted,
   * but its number stays printable. */
  invoice: { id: string | null; number: string | null; date: string | null };
  customer: BuyerInfo & { id: string };
  items: { name: string; unit: string; hsn: string | null; qty: number; rate: number; discount: number }[];
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  interState: boolean;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** How much of the total was set off against the invoice's balance. */
  applied: number;
  /** The rest — owed back to the customer. */
  refundDue: number;
};

export async function loadCreditNoteDocument(id: string): Promise<CreditNoteDoc | null> {
  const cn = await prisma.creditNote.findUnique({
    where: { id },
    include: {
      // cuid ids sort in creation order, i.e. the order the lines were saved.
      items: { orderBy: { id: 'asc' } },
      customer: { select: { id: true, ...BUYER_SELECT } },
      invoice: { select: { id: true, number: true, date: true } },
      payment: { select: { amount: true } },
    },
  });
  if (!cn) return null;
  const { id: customerId, ...buyer } = cn.customer;
  return {
    id: cn.id,
    number: cn.number,
    date: istDateString(cn.date),
    reason: cn.reason,
    restock: cn.restock,
    invoice: {
      id: cn.invoice?.id ?? null,
      number: cn.invoice?.number ?? cn.invoiceNumber,
      date: cn.invoice ? istDateString(cn.invoice.date) : null,
    },
    customer: { id: customerId, ...toBuyerInfo(buyer) },
    items: cn.items.map((it) => ({
      name: it.name,
      unit: it.unit,
      hsn: it.hsn,
      qty: Number(it.qty),
      rate: Number(it.rate),
      discount: Number(it.discount),
    })),
    cgstRate: Number(cn.cgstRate),
    sgstRate: Number(cn.sgstRate),
    igstRate: Number(cn.igstRate),
    interState: cn.interState,
    taxable: Number(cn.taxable),
    cgst: Number(cn.cgst),
    sgst: Number(cn.sgst),
    igst: Number(cn.igst),
    total: Number(cn.total),
    applied: Number(cn.payment?.amount ?? 0),
    refundDue: Number(cn.refundDue),
  };
}
