import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { AccountClient } from './account-client';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `My account — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const [user, company] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, phone: true } }),
    getCompany(),
  ]);
  if (!user) redirect('/login');

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
          <UserCog size={18} className="text-brand" /> My account
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Your own login details — separate from your company&apos;s profile.</p>
      </div>
      <AccountClient user={{ email: user.email, phone: user.phone, companyName: company.name }} />
    </div>
  );
}
