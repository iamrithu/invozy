// Server-only: a customer's statement of account. Not auth-checked and not
// a 'use server' module — src/actions/statements.ts wraps it for signed-in
// callers, and /print/statements/[customerId] calls it after verifying its
// signed token. Never import this from a client component.

import { prisma } from '@/lib/prisma';
import { istDayRangeUtc } from '@/lib/dates';
import type { BuyerInfo } from './clean-doc';
import { BUYER_SELECT, toBuyerInfo } from './print-data';
import { istDateString } from './format';
import { round2 } from '@/components/credit-notes/credit-note-math';

export type StatementRow = {
  date: string;
  kind: 'invoice' | 'payment' | 'credit-note' | 'refund';
  particulars: string;
  ref: string;
  debit: number;
  credit: number;
  /** Running balance after this row — positive means the customer owes,
   * negative that they hold credit with us. */
  balance: number;
  /** The invoice the row is about, when there is one. */
  invoiceId: string;
};

export type CustomerStatement = {
  customer: BuyerInfo & { id: string };
  /** IST calendar dates (`YYYY-MM-DD`) the statement covers; null = open. */
  from: string | null;
  to: string | null;
  opening: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real `YYYY-MM-DD` calendar date. */
export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && DATE_RE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

/** The customer's account between two IST dates, with a running balance:
 * invoices and refunds paid out to them are debits; money received and
 * credit notes (at their full value) are credits. A credit note's set-offs
 * and adjustments against invoices are just how that credit got used, so
 * they aren't rows of their own — the closing balance is what the invoices
 * still show as due, less any credit the customer still holds. Drafts are
 * left out everywhere — they aren't sales yet.
 *
 * Opening balance = everything above dated before `from`. Returns null for
 * an unknown customer. */
export async function buildCustomerStatement(customerId: string, from?: string | null, to?: string | null): Promise<CustomerStatement | null> {
  const fromDate = isIsoDate(from) ? from : null;
  const toDate = isIsoDate(to) ? to : null;
  const start = fromDate ? istDayRangeUtc(fromDate).gte : undefined;
  const end = toDate ? istDayRangeUtc(toDate).lt : undefined;
  const inRange = start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {};
  const sales = { customerId, status: { not: 'DRAFT' as const } };
  // Money actually received — a credit note's own payments are excluded.
  const cash = { invoice: sales, creditNoteId: null };
  const before = start ? { date: { lt: start } } : null;

  const [customer, openingInvoices, openingPayments, openingCredits, openingRefunds, invoices, payments, creditNotes, refunds] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, ...BUYER_SELECT } }),
    before ? prisma.invoice.aggregate({ where: { ...sales, ...before }, _sum: { total: true } }) : null,
    before ? prisma.payment.aggregate({ where: { ...cash, ...before }, _sum: { amount: true } }) : null,
    before ? prisma.creditNote.aggregate({ where: { customerId, ...before }, _sum: { total: true } }) : null,
    before ? prisma.refund.aggregate({ where: { creditNote: { customerId }, ...before }, _sum: { amount: true } }) : null,
    prisma.invoice.findMany({
      where: { ...sales, ...inRange },
      select: { id: true, number: true, date: true, total: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { ...cash, ...inRange },
      select: {
        id: true,
        date: true,
        amount: true,
        mode: true,
        reference: true,
        receiptNo: true,
        createdAt: true,
        invoice: { select: { id: true, number: true } },
      },
    }),
    prisma.creditNote.findMany({
      where: { customerId, ...inRange },
      select: { number: true, date: true, total: true, reason: true, invoiceId: true, invoiceNumber: true, createdAt: true },
    }),
    prisma.refund.findMany({
      where: { creditNote: { customerId }, ...inRange },
      select: { date: true, amount: true, mode: true, reference: true, createdAt: true, creditNote: { select: { number: true, invoiceId: true } } },
    }),
  ]);
  if (!customer) return null;

  const opening = round2(
    Number(openingInvoices?._sum.total ?? 0) -
      Number(openingPayments?._sum.amount ?? 0) -
      Number(openingCredits?._sum.total ?? 0) +
      Number(openingRefunds?._sum.amount ?? 0)
  );

  type Entry = Omit<StatementRow, 'balance'> & { sort: [number, number] };
  const entries: Entry[] = [
    ...invoices.map(
      (inv): Entry => ({
        date: istDateString(inv.date),
        kind: 'invoice',
        particulars: 'Invoice',
        ref: inv.number,
        debit: Number(inv.total),
        credit: 0,
        invoiceId: inv.id,
        sort: [0, inv.createdAt.getTime()],
      })
    ),
    ...payments.map(
      (p): Entry => ({
        date: istDateString(p.date),
        kind: 'payment',
        particulars: `Payment against ${p.invoice.number}${p.reference ? ` · Ref ${p.reference}` : ''}`,
        ref: [p.receiptNo, p.mode].filter(Boolean).join(' · ') || '—',
        debit: 0,
        credit: Number(p.amount),
        invoiceId: p.invoice.id,
        // Same day: invoices first, then what was paid against them.
        sort: [1, p.createdAt.getTime()],
      })
    ),
    ...creditNotes.map(
      (cn): Entry => ({
        date: istDateString(cn.date),
        kind: 'credit-note',
        particulars: `Credit note${cn.reason ? ` — ${cn.reason}` : ''}${cn.invoiceNumber ? ` (against ${cn.invoiceNumber})` : ''}`,
        ref: cn.number,
        debit: 0,
        credit: Number(cn.total),
        invoiceId: cn.invoiceId ?? '',
        sort: [2, cn.createdAt.getTime()],
      })
    ),
    ...refunds.map(
      (r): Entry => ({
        date: istDateString(r.date),
        kind: 'refund',
        particulars: `Refund paid${r.mode ? ` by ${r.mode}` : ''} out of ${r.creditNote.number}${r.reference ? ` · ${r.reference}` : ''}`,
        ref: r.creditNote.number,
        debit: Number(r.amount),
        credit: 0,
        invoiceId: r.creditNote.invoiceId ?? '',
        sort: [3, r.createdAt.getTime()],
      })
    ),
  ];
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.sort[0] - b.sort[0] || a.sort[1] - b.sort[1]);

  let balance = opening;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: StatementRow[] = entries.map(({ sort: _sort, ...e }) => {
    balance = round2(balance + e.debit - e.credit);
    totalDebit += e.debit;
    totalCredit += e.credit;
    return { ...e, balance };
  });

  const { id, ...buyer } = customer;
  return {
    customer: { id, ...toBuyerInfo(buyer) },
    from: fromDate,
    to: toDate,
    opening,
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closing: round2(opening + totalDebit - totalCredit),
  };
}
