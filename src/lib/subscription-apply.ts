import { addMonths } from 'date-fns';
import { rootPrisma } from './prisma';
import { isPlanKey } from './plans';

// Turning a payment into paid-up time. Platform-level (rootPrisma): it runs
// from the Razorpay webhook, which has no session, as well as from checkout
// and the admin panel. Idempotent per order — the checkout callback and the
// webhook can both arrive for the same payment.

type CompanyPeriod = { subscriptionStatus: string; trialEndsAt: Date | null; currentPeriodEnd: Date | null };

/** A new paid period starts when the current paid time (or the trial) runs
 * out — paying early never loses days — or now if that's already past. */
export function nextPeriod(company: CompanyPeriod, months: number, now = new Date()): { start: Date; end: Date } {
  const paidUntil = company.subscriptionStatus === 'ACTIVE' ? company.currentPeriodEnd : company.subscriptionStatus === 'TRIALING' ? company.trialEndsAt : null;
  const start = paidUntil && paidUntil > now ? paidUntil : now;
  return { start, end: addMonths(start, months) };
}

export type ApplyResult = 'applied' | 'already' | 'unknown';

/** Marks a Razorpay order paid and extends the company's subscription. */
export async function applyPaidOrder(orderId: string, paymentId: string): Promise<ApplyResult> {
  return rootPrisma.$transaction(async (tx) => {
    const pay = await tx.subscriptionPayment.findUnique({ where: { orderId } });
    if (!pay) return 'unknown';
    // One payment at a time per company, so two orders can't both start from
    // the same "paid until".
    await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${pay.companyId} FOR UPDATE`;
    const claimed = await tx.subscriptionPayment.updateMany({ where: { id: pay.id, status: { not: 'paid' } }, data: { status: 'paid', paymentId, paidAt: new Date() } });
    if (!claimed.count) return 'already';
    const company = await tx.company.findUniqueOrThrow({ where: { id: pay.companyId }, select: { subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true } });
    const { start, end } = nextPeriod(company, pay.months);
    await tx.subscriptionPayment.update({ where: { id: pay.id }, data: { periodStart: start, periodEnd: end } });
    await tx.company.update({
      where: { id: pay.companyId },
      data: { plan: isPlanKey(pay.plan) ? pay.plan : undefined, subscriptionStatus: 'ACTIVE', currentPeriodEnd: end },
    });
    return 'applied';
  });
}

/** A payment the platform admin received outside Razorpay (bank transfer,
 * cash…): recorded as paid and applied at once. */
export async function recordManualPayment(input: { companyId: string; plan: string; months: number; amount: number; note: string | null; recordedBy: string }) {
  return rootPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${input.companyId} FOR UPDATE`;
    const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true } });
    const { start, end } = nextPeriod(company, input.months);
    await tx.subscriptionPayment.create({
      data: {
        companyId: input.companyId,
        plan: input.plan,
        months: input.months,
        amount: input.amount,
        provider: 'manual',
        status: 'paid',
        periodStart: start,
        periodEnd: end,
        recordedBy: input.recordedBy,
        note: input.note,
        paidAt: new Date(),
      },
    });
    await tx.company.update({ where: { id: input.companyId }, data: { plan: input.plan, subscriptionStatus: 'ACTIVE', currentPeriodEnd: end } });
    return { start, end };
  });
}
