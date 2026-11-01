import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';

export async function getCompany() {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) throw new Error('Company profile not found.');
  return company;
}
