import { cache } from 'react';
import { prisma } from './prisma';
import { auth } from '@/auth';

/**
 * Multi-tenant lookup scoped to the signed-in user's companyId — every
 * server action calls this with no arguments, so this one function is the
 * entire tenancy boundary for the data layer. Throws rather than returning
 * null so callers never have to re-check.
 *
 * Wrapped in React's cache() so the layout and a page can both call this in
 * the same request without doubling the DB round-trip — repeat calls within
 * one render tree return the same in-flight/resolved promise.
 */
export const getCompany = cache(async () => {
  const session = await auth();
  if (!session?.user?.companyId) {
    throw new Error('Not signed in to a company.');
  }
  return prisma.company.findUniqueOrThrow({ where: { id: session.user.companyId } });
});
