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
  items: { name: string; unit: string; hsn: string | null; qty: number; rate: number; discount: number; creditPct: number; restock: boolean }[];
  /** Taken off before GST, with its reason. */
  deduction: number;
  deductionReason: string | null;
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
  /** What was left over when it was issued — the customer's credit. */
  refundDue: number;
  /** That credit since used to pay their other invoices… */
  adjusted: number;
  /** …or paid back to them. */
  refunded: number;
  /** Still owed to the customer: total − set off − adjusted − refunded. */
  open: number;
  /** Every "Credit note" payment it made — `own` is the set-off against
   * its own invoice, the rest are adjustments on other invoices. */
  adjustments: { paymentId: string; invoiceId: string; invoiceNumber: string; amount: number; date: string; own: boolean }[];
  refunds: { id: string; amount: number; date: string; mode: string | null; reference: string | null }[];
};

export async function loadCreditNoteDocument(id: string): Promise<CreditNoteDoc | null> {
  const cn = await prisma.creditNote.findUnique({
    where: { id },
    include: {
      // cuid ids sort in creation order, i.e. the order the lines were saved.
      items: { orderBy: { id: 'asc' } },
      customer: { select: { id: true, ...BUYER_SELECT } },
      invoice: { select: { id: true, number: true, date: true } },
      payments: { select: { id: true, amount: true, date: true, invoiceId: true, invoice: { select: { number: true } } }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
      refunds: { select: { id: true, amount: true, date: true, mode: true, reference: true }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!cn) return null;
  const adjustments = cn.payments.map((p) => ({
    paymentId: p.id,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoice.number,
    amount: Number(p.amount),
    date: istDateString(p.date),
    own: p.invoiceId === cn.invoiceId,
  }));
  const applied = adjustments.filter((a) => a.own).reduce((s, a) => s + a.amount, 0);
  const adjusted = adjustments.filter((a) => !a.own).reduce((s, a) => s + a.amount, 0);
  const refunded = cn.refunds.reduce((s, r) => s + Number(r.amount), 0);
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
      creditPct: Number(it.creditPct),
      restock: it.restock,
    })),
    deduction: Number(cn.deduction),
    deductionReason: cn.deductionReason,
    cgstRate: Number(cn.cgstRate),
    sgstRate: Number(cn.sgstRate),
    igstRate: Number(cn.igstRate),
    interState: cn.interState,
    taxable: Number(cn.taxable),
    cgst: Number(cn.cgst),
    sgst: Number(cn.sgst),
    igst: Number(cn.igst),
    total: Number(cn.total),
    applied,
    refundDue: Number(cn.refundDue),
    adjusted,
    refunded,
    open: Math.max(0, Math.round((Number(cn.total) - applied - adjusted - refunded) * 100) / 100),
    adjustments,
    refunds: cn.refunds.map((r) => ({ id: r.id, amount: Number(r.amount), date: istDateString(r.date), mode: r.mode, reference: r.reference })),
  };
}
