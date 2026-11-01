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
  kind: 'invoice' | 'payment' | 'credit-note';
  particulars: string;
  ref: string;
  debit: number;
  credit: number;
  /** Running balance after this row — positive means the customer owes. */
  balance: number;
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

/** Invoices (debit) and the money received against them (credit) for one
 * customer between two IST dates, with a running balance. Drafts are left
 * out everywhere — they aren't sales yet. A credit note shows through the
 * payment row it applied to its invoice, so the closing balance always
 * equals what the invoices themselves still show as due; any refund due
 * beyond an invoice's balance is settled outside the ledger.
 *
 * Opening balance = invoices dated before `from` − payments dated before
 * `from`. Returns null for an unknown customer. */
export async function buildCustomerStatement(customerId: string, from?: string | null, to?: string | null): Promise<CustomerStatement | null> {
  const fromDate = isIsoDate(from) ? from : null;
  const toDate = isIsoDate(to) ? to : null;
  const start = fromDate ? istDayRangeUtc(fromDate).gte : undefined;
  const end = toDate ? istDayRangeUtc(toDate).lt : undefined;
  const inRange = start || end ? { date: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {};
  const sales = { customerId, status: { not: 'DRAFT' as const } };

  const [customer, openingInvoices, openingPayments, invoices, payments] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, ...BUYER_SELECT } }),
    start ? prisma.invoice.aggregate({ where: { ...sales, date: { lt: start } }, _sum: { total: true } }) : null,
    start ? prisma.payment.aggregate({ where: { invoice: sales, date: { lt: start } }, _sum: { amount: true } }) : null,
    prisma.invoice.findMany({
      where: { ...sales, ...inRange },
      select: { id: true, number: true, date: true, total: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { invoice: sales, ...inRange },
      select: {
        id: true,
        date: true,
        amount: true,
        mode: true,
        reference: true,
        receiptNo: true,
        createdAt: true,
        creditNote: { select: { number: true } },
        invoice: { select: { id: true, number: true } },
      },
    }),
  ]);
  if (!customer) return null;

  const opening = round2(Number(openingInvoices?._sum.total ?? 0) - Number(openingPayments?._sum.amount ?? 0));

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
    ...payments.map((p): Entry => {
      const isCredit = !!p.creditNote;
      return {
        date: istDateString(p.date),
        kind: isCredit ? 'credit-note' : 'payment',
        particulars: isCredit
          ? `Credit note against ${p.invoice.number}`
          : `Payment against ${p.invoice.number}${p.reference ? ` · Ref ${p.reference}` : ''}`,
        ref: isCredit ? p.creditNote!.number : [p.receiptNo, p.mode].filter(Boolean).join(' · ') || '—',
        debit: 0,
        credit: Number(p.amount),
        invoiceId: p.invoice.id,
        // Same day: invoices first, then what was paid against them.
        sort: [1, p.createdAt.getTime()],
      };
    }),
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
