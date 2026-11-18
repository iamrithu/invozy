import { MODULE_KEYS, type ModuleKey } from './modules';

// The subscription plans companies can be on. Prices are in rupees and are
// placeholders for the business to set — change them here (nothing else
// stores a price; a payment row records what was actually charged).
// `modules` are the optional modules (src/lib/modules.ts) the plan includes;
// the core app is in every plan. Limits: null = unlimited.

export type PlanKey = 'starter' | 'growth' | 'business';

export type Plan = {
  key: PlanKey;
  label: string;
  blurb: string;
  monthly: number;
  yearly: number;
  modules: readonly ModuleKey[];
  maxUsers: number | null;
  maxInvoicesPerMonth: number | null;
};

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: 'starter',
    label: 'Starter',
    blurb: 'GST invoices, payments, customers and products for a small shop.',
    monthly: 499,
    yearly: 4990,
    modules: ['returns', 'team'],
    maxUsers: 2,
    maxInvoicesPerMonth: 150,
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    blurb: 'Adds inventory, purchases, reports, coupons and an online store for a growing business.',
    monthly: 999,
    yearly: 9990,
    modules: ['inventory', 'purchases', 'returns', 'reports', 'team', 'marketing', 'storefront'],
    maxUsers: 5,
    maxInvoicesPerMonth: 1000,
  },
  business: {
    key: 'business',
    label: 'Business',
    blurb: 'Everything, with room for a larger team and unlimited invoices.',
    monthly: 1999,
    yearly: 19990,
    modules: MODULE_KEYS,
    maxUsers: 25,
    maxInvoicesPerMonth: null,
  },
};

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
export const TRIAL_DAYS = 14;
/** After a trial or paid period ends, the company keeps working this long
 * (with a warning) before new documents are blocked. */
export const GRACE_DAYS = 7;

export function isPlanKey(key: string): key is PlanKey {
  return (PLAN_KEYS as string[]).includes(key);
}

/** Unknown/legacy keys fall back to Business — never silently take features away. */
export function planOf(key: string | null | undefined): Plan {
  return key && isPlanKey(key) ? PLANS[key] : PLANS.business;
}

export function priceFor(plan: Plan, cycle: 'monthly' | 'yearly'): { amount: number; months: number } {
  return cycle === 'yearly' ? { amount: plan.yearly, months: 12 } : { amount: plan.monthly, months: 1 };
}
