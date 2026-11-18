'use server';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { istDayRangeUtc } from '@/lib/dates';

// Sales › Payments: every receipt across invoices. Payments are still
// recorded on an invoice (its page, or delivering an order with the money
// collected); this is the one list of them all.

export type PaymentRow = {
  id: string;
  receiptNo: string | null;
  date: string;
  amount: number;
  mode: string | null;
  reference: string | null;
  /** Settled by a credit note rather than money received. */
  creditNote: string | null;
  invoice: { id: string; number: string };
  customerName: string;
  orderId: string | null;
};

export type PaymentsPage = { rows: PaymentRow[]; total: number; sum: number; byMode: { mode: string; amount: number; count: number }[] };

export async function listPayments(opts: { from: string; to: string; mode?: string; search?: string; page?: number; pageSize?: number }): Promise<PaymentsPage> {
  await requireUser();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(opts.pageSize ?? 30, 100);
  const range = { gte: istDayRangeUtc(opts.from).gte, lt: istDayRangeUtc(opts.to).lt };
  const q = opts.search?.trim();
  const base: Prisma.PaymentWhereInput = {
    date: range,
    ...(q
      ? {
          OR: [
            { receiptNo: { contains: q, mode: 'insensitive' } },
            { reference: { contains: q, mode: 'insensitive' } },
            { invoice: { number: { contains: q, mode: 'insensitive' } } },
            { invoice: { customer: { name: { contains: q, mode: 'insensitive' } } } },
            { invoice: { customer: { shopName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const modeFilter: Prisma.PaymentWhereInput =
    !opts.mode || opts.mode === 'all' ? {} : opts.mode === 'Credit note' ? { creditNoteId: { not: null } } : { mode: { equals: opts.mode, mode: 'insensitive' }, creditNoteId: null };
  const where = { ...base, ...modeFilter };
  const [rows, total, grouped] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { invoice: { select: { id: true, number: true, customer: { select: { name: true, shopName: true } }, order: { select: { id: true } } } }, creditNote: { select: { number: true } } },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['mode', 'creditNoteId'], where: base, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const modes = new Map<string, { amount: number; count: number }>();
  for (const g of grouped) {
    const key = g.creditNoteId ? 'Credit note' : g.mode?.trim() || 'Other';
    const cur = modes.get(key) ?? { amount: 0, count: 0 };
    modes.set(key, { amount: cur.amount + Number(g._sum.amount ?? 0), count: cur.count + g._count._all });
  }
  const byMode = Array.from(modes, ([mode, v]) => ({ mode, ...v })).sort((a, b) => b.amount - a.amount);
  return {
    rows: rows.map((p) => ({
      id: p.id,
      receiptNo: p.receiptNo,
      date: p.date.toISOString(),
      amount: Number(p.amount),
      mode: p.mode,
      reference: p.reference,
      creditNote: p.creditNote?.number ?? null,
      invoice: { id: p.invoice.id, number: p.invoice.number },
      customerName: p.invoice.customer.shopName || p.invoice.customer.name,
      orderId: p.invoice.order?.id ?? null,
    })),
    total,
    sum: byMode.filter((m) => m.mode !== 'Credit note').reduce((s, m) => s + m.amount, 0),
    byMode,
  };
}
