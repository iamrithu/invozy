import { prisma } from './prisma';
import { auth } from '@/auth';

/**
 * Multi-tenant lookup scoped to the signed-in user's companyId — every
 * server action calls this with no arguments, so this one function is the
 * entire tenancy boundary for the data layer. Throws rather than returning
 * null so callers never have to re-check.
 */
export async function getCompany() {
  const session = await auth();
  if (!session?.user?.companyId) {
    throw new Error('Not signed in to a company.');
  }
  return prisma.company.findUniqueOrThrow({ where: { id: session.user.companyId } });
}
