import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';

export async function getCompany() {
  const user = await requireUser();
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (!company) throw new Error('Company profile not found.');
  return company;
}
