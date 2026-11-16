'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/session';
import { getCompany } from '@/lib/get-company';
import { subscriptionView, type BillingState } from '@/lib/entitlements';
import { PLANS, PLAN_KEYS, isPlanKey, priceFor, type PlanKey } from '@/lib/plans';
import { activeLogins, invoicesThisMonth, limitsOf } from '@/lib/subscription-guard';
import { createOrder, razorpayConfigured, razorpayKeyId, verifyCheckoutSignature } from '@/lib/razorpay';
import { applyPaidOrder } from '@/lib/subscription-apply';
import { logActivity } from '@/lib/activity';
import { sendEmail } from '@/lib/email';
import { APP_NAME } from '@/lib/brand';
import { toActionError, type ActionResult } from '@/lib/action-result';

// The company owner's side of the subscription (/billing): see the plan and
// usage, pay online (Razorpay), and ask for the company to be deleted.

export type BillingOverview = {
  companyName: string;
  plan: { key: PlanKey | string; label: string };
  state: BillingState;
  endsAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  complimentary: boolean;
  usage: { invoicesThisMonth: number; maxInvoicesPerMonth: number | null; activeLogins: number; maxUsers: number | null };
  plans: { key: PlanKey; label: string; blurb: string; monthly: number; yearly: number; maxUsers: number | null; maxInvoicesPerMonth: number | null; modules: string[] }[];
  payments: { id: string; plan: string; months: number; amount: number; provider: string; status: string; periodStart: string | null; periodEnd: string | null; createdAt: string; paidAt: string | null }[];
  onlinePayment: boolean;
  deletionRequestedAt: string | null;
};

export async function getBillingOverview(): Promise<BillingOverview> {
  await requireOwner();
  const company = await getCompany();
  const view = subscriptionView(company);
  const limits = limitsOf(view);
  const [invoices, logins, payments] = await Promise.all([
    invoicesThisMonth(),
    activeLogins(),
    prisma.subscriptionPayment.findMany({ where: { status: { not: 'created' } }, orderBy: { createdAt: 'desc' }, take: 24 }),
  ]);
  return {
    companyName: company.name,
    plan: { key: view.plan.key, label: view.plan.label },
    state: view.state,
    endsAt: view.endsAt?.toISOString() ?? null,
    graceEndsAt: view.graceEndsAt?.toISOString() ?? null,
    daysLeft: view.daysLeft,
    complimentary: company.subscriptionStatus === 'ACTIVE' && !company.currentPeriodEnd,
    usage: { invoicesThisMonth: invoices, maxInvoicesPerMonth: limits.maxInvoicesPerMonth, activeLogins: logins, maxUsers: limits.maxUsers },
    plans: PLAN_KEYS.map((k) => {
      const p = PLANS[k];
      return { key: k, label: p.label, blurb: p.blurb, monthly: p.monthly, yearly: p.yearly, maxUsers: p.maxUsers, maxInvoicesPerMonth: p.maxInvoicesPerMonth, modules: [...p.modules] };
    }),
    payments: payments.map((p) => ({
      id: p.id,
      plan: p.plan,
      months: p.months,
      amount: Number(p.amount),
      provider: p.provider,
      status: p.status,
      periodStart: p.periodStart?.toISOString() ?? null,
      periodEnd: p.periodEnd?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      paidAt: p.paidAt?.toISOString() ?? null,
    })),
    onlinePayment: razorpayConfigured(),
    deletionRequestedAt: company.deletionRequestedAt?.toISOString() ?? null,
  };
}

export type CheckoutStart = { orderId: string; amountPaise: number; keyId: string; companyName: string; email: string | null; description: string };

/** Creates a Razorpay order for `plan` × `cycle`. The amount comes from the
 * plan table here, never from the browser. */
export async function startCheckout(plan: string, cycle: 'monthly' | 'yearly'): Promise<ActionResult<{ checkout: CheckoutStart }>> {
  try {
    const user = await requireOwner();
    if (!isPlanKey(plan)) return { error: 'Pick a plan.' };
    if (cycle !== 'monthly' && cycle !== 'yearly') return { error: 'Pick monthly or yearly.' };
    if (!razorpayConfigured()) return { error: 'Online payment isn’t set up yet — contact support to change your plan.' };
    const company = await getCompany();
    const { amount, months } = priceFor(PLANS[plan], cycle);
    const order = await createOrder(amount, `${company.id.slice(-10)}-${Date.now()}`, { companyId: company.id, plan, months: String(months) });
    await prisma.subscriptionPayment.create({ data: { plan, months, amount, provider: 'razorpay', orderId: order.id, status: 'created' } });
    return {
      checkout: {
        orderId: order.id,
        amountPaise: order.amount,
        keyId: razorpayKeyId()!,
        companyName: company.name,
        email: user.email,
        description: `${APP_NAME} ${PLANS[plan].label} — ${months === 12 ? '1 year' : '1 month'}`,
      },
    };
  } catch (e) {
    return toActionError(e);
  }
}

/** Checkout's success callback: applied only if Razorpay's signature checks
 * out and the order belongs to this company. The webhook does the same
 * independently, whichever arrives first wins (applyPaidOrder is idempotent). */
export async function confirmCheckout(input: { orderId: string; paymentId: string; signature: string }): Promise<ActionResult<{ state: string }>> {
  try {
    await requireOwner();
    const mine = await prisma.subscriptionPayment.findUnique({ where: { orderId: input.orderId }, select: { id: true } });
    if (!mine) return { error: 'That payment isn’t for this company.' };
    if (!verifyCheckoutSignature(input.orderId, input.paymentId, input.signature)) return { error: 'The payment couldn’t be verified. If money was taken, it will be applied automatically within a few minutes.' };
    const result = await applyPaidOrder(input.orderId, input.paymentId);
    revalidatePath('/', 'layout');
    return { state: result };
  } catch (e) {
    return toActionError(e);
  }
}

/** The owner asks for the company and all its data to be deleted. The
 * platform admin carries it out (and can see the request in /admin); until
 * then it can be withdrawn. Typing the company name confirms it. */
export async function requestCompanyDeletion(confirmName: string): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const company = await getCompany();
    if (confirmName.trim().toLowerCase() !== company.name.trim().toLowerCase()) return { error: 'Type the company name exactly to confirm.' };
    await prisma.company.update({ where: { id: company.id }, data: { deletionRequestedAt: new Date() } });
    await logActivity({ userId: user.id, action: 'company.deletion-requested', entityType: 'company', entityId: company.id, summary: 'Asked for the company and its data to be deleted' });
    const admin = process.env.ADMIN_EMAIL;
    if (admin) {
      await sendEmail(admin, `${APP_NAME}: deletion requested — ${company.name}`, `<p><b>${company.name}</b> (${company.id}) asked for its account and data to be deleted. Review it in /admin.</p>`).catch((e) =>
        console.error('deletion request email failed', e)
      );
    }
    revalidatePath('/billing');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}

export async function cancelCompanyDeletion(): Promise<ActionResult> {
  try {
    const user = await requireOwner();
    const company = await getCompany();
    await prisma.company.update({ where: { id: company.id }, data: { deletionRequestedAt: null } });
    await logActivity({ userId: user.id, action: 'company.deletion-cancelled', entityType: 'company', entityId: company.id, summary: 'Withdrew the request to delete the company' });
    revalidatePath('/billing');
    return {};
  } catch (e) {
    return toActionError(e);
  }
}
