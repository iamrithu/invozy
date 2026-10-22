import { cache } from 'react';
import { prisma } from './prisma';
import { COMPANY_ID } from './company-id';
import { requireUser } from './session';

/**
 * The one company this deployment bills for — a primary-key lookup on the
 * singleton row created by `npm run setup`. Also enforces sign-in (via
 * requireUser), so a caller that only needs the session and not company
 * data should call requireUser() directly and skip the query.
 *
 * Wrapped in React's cache() so the layout and a page can both call this in
 * the same request without doubling the DB round-trip.
 */
export const getCompany = cache(async () => {
  // In parallel — the company row is discarded if the auth check throws.
  const [, company] = await Promise.all([requireUser(), prisma.company.findUnique({ where: { id: COMPANY_ID } })]);
  if (!company) throw new Error('Company profile not found — run `npm run setup` to create it.');
  return company;
});
