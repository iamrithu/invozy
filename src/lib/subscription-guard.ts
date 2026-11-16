import { prisma } from './prisma';
import { getCompany } from './get-company';
import { subscriptionView, type SubscriptionView } from './entitlements';
import { PLANS } from './plans';
import { istDayRangeUtc, todayIst } from './dates';

// Server-side enforcement of the subscription: what a company may CREATE.
// Reading, editing, recording payments and exporting always keep working —
// a lapsed subscription never holds a business's own data hostage.

export type Creatable = 'invoice' | 'customer' | 'product' | 'purchase' | 'credit note' | 'supplier' | 'login';

const NOUN: Record<Creatable, string> = {
  invoice: 'invoices',
  customer: 'customers',
  product: 'products',
  purchase: 'purchases',
  'credit note': 'credit notes',
  supplier: 'suppliers',
  login: 'logins',
};

/** The limits in force: the plan's, or Business's during a free trial. */
export function limitsOf(view: SubscriptionView) {
  const plan = view.state === 'trialing' ? PLANS.business : view.plan;
  return { maxUsers: plan.maxUsers, maxInvoicesPerMonth: plan.maxInvoicesPerMonth };
}

/** Invoices created since the 1st of this month (IST). */
export async function invoicesThisMonth(): Promise<number> {
  const since = istDayRangeUtc(`${todayIst().slice(0, 7)}-01`).gte;
  return prisma.invoice.count({ where: { createdAt: { gte: since } } });
}

export async function activeLogins(): Promise<number> {
  return prisma.user.count({ where: { active: true } });
}

/** Throws a readable error when the company can't create one more `kind`. */
export async function assertCanCreate(kind: Creatable): Promise<void> {
  const company = await getCompany();
  const view = subscriptionView(company);
  if (view.state === 'locked') {
    throw new Error(`Your subscription has ended, so new ${NOUN[kind]} can’t be added. Renew it on the Billing page — everything already entered is still here.`);
  }
  const limits = limitsOf(view);
  if (kind === 'invoice' && limits.maxInvoicesPerMonth !== null && (await invoicesThisMonth()) >= limits.maxInvoicesPerMonth) {
    throw new Error(`You’ve made ${limits.maxInvoicesPerMonth} invoices this month — the ${view.plan.label} plan’s limit. Upgrade on the Billing page to keep billing.`);
  }
  if (kind === 'login' && limits.maxUsers !== null && (await activeLogins()) >= limits.maxUsers) {
    throw new Error(`The ${view.plan.label} plan includes ${limits.maxUsers} active login${limits.maxUsers === 1 ? '' : 's'}. Switch one off or upgrade on the Billing page.`);
  }
}
