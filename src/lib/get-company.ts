import { cache } from 'react';
import { prisma } from './prisma';
import { requireUser } from './session';
import { effectiveDisabledModules } from './entitlements';

/**
 * The signed-in user's company — a primary-key lookup through the scoped
 * client, so it can only ever return the company in scope. Also enforces
 * sign-in (via requireUser), so a caller that only needs the session and not
 * company data should call requireUser() directly and skip the query.
 *
 * Wrapped in React's cache() so the layout and a page can both call this in
 * the same request without doubling the DB round-trip.
 *
 * `disabledModules` here is the EFFECTIVE list — modules the company's plan
 * doesn't include plus the ones the platform admin switched off (src/lib/
 * entitlements.ts) — because that's what every module check means. The
 * admin's own switches alone are `adminDisabledModules`.
 */
export const getCompany = cache(async () => {
  const user = await requireUser();
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (!company) throw new Error('Company profile not found.');
  return { ...company, adminDisabledModules: company.disabledModules, disabledModules: effectiveDisabledModules(company) };
});
