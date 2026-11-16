import { MODULE_KEYS, type ModuleKey } from './modules';
import { GRACE_DAYS, planOf, type Plan } from './plans';

// What a company may use right now — pure functions over the Company row, safe
// on the server and the client. Two inputs: the subscription (plan, trial,
// paid period) and the platform admin's per-company module switches.

export type SubscriptionFields = {
  plan: string;
  subscriptionStatus: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
};

export type BillingState =
  /** Free trial running — every module included. */
  | 'trialing'
  /** Paid (or complimentary: ACTIVE with no end date). */
  | 'active'
  /** Trial or period over, or marked past due — still works, with a warning, until the grace period ends. */
  | 'grace'
  /** Grace over, or cancelled — data stays readable, nothing new can be created. */
  | 'locked';

export type SubscriptionView = {
  plan: Plan;
  state: BillingState;
  /** When the trial or paid period ends (null = no end). */
  endsAt: Date | null;
  /** When `grace` turns into `locked`. */
  graceEndsAt: Date | null;
  /** Whole days until endsAt (trialing/active) or graceEndsAt (grace); null when there's no end. */
  daysLeft: number | null;
};

const DAY = 86_400_000;
const toDate = (d: Date | string | null) => (d ? new Date(d) : null);
const daysUntil = (d: Date, now: Date) => Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY));

export function subscriptionView(company: SubscriptionFields, now = new Date()): SubscriptionView {
  const plan = planOf(company.plan);
  const status = company.subscriptionStatus;
  if (status === 'CANCELLED') return { plan, state: 'locked', endsAt: null, graceEndsAt: null, daysLeft: null };

  const endsAt = status === 'TRIALING' ? toDate(company.trialEndsAt) : toDate(company.currentPeriodEnd);
  if (!endsAt) {
    // No end date: an open trial, or complimentary ACTIVE. PAST_DUE without a
    // date is the admin flagging it — warn, but nothing to count down to.
    return { plan, state: status === 'TRIALING' ? 'trialing' : status === 'PAST_DUE' ? 'grace' : 'active', endsAt: null, graceEndsAt: null, daysLeft: null };
  }
  const graceEndsAt = new Date(endsAt.getTime() + GRACE_DAYS * DAY);
  if (status !== 'PAST_DUE' && now < endsAt) return { plan, state: status === 'TRIALING' ? 'trialing' : 'active', endsAt, graceEndsAt, daysLeft: daysUntil(endsAt, now) };
  if (now < graceEndsAt) return { plan, state: 'grace', endsAt, graceEndsAt, daysLeft: daysUntil(graceEndsAt, now) };
  return { plan, state: 'locked', endsAt, graceEndsAt, daysLeft: 0 };
}

/** The modules switched off for this company: whatever its plan doesn't
 * include (a trial includes everything) plus the platform admin's switches.
 * This — not Company.disabledModules alone — is what every module check
 * uses; getCompany() returns it as `disabledModules`. */
export function effectiveDisabledModules(company: SubscriptionFields & { disabledModules: readonly string[] }): ModuleKey[] {
  const view = subscriptionView(company);
  const included = new Set<string>(view.state === 'trialing' ? MODULE_KEYS : view.plan.modules);
  return MODULE_KEYS.filter((k) => !included.has(k) || company.disabledModules.includes(k));
}

/** Everything effectiveDisabledModules needs — select this with Prisma. */
export const ENTITLEMENT_SELECT = { plan: true, subscriptionStatus: true, trialEndsAt: true, currentPeriodEnd: true, disabledModules: true } as const;
