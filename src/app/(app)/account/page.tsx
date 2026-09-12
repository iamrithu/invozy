import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { AccountClient } from './account-client';

export const metadata: Metadata = { title: 'My account — Invozy' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role === 'SUPER_ADMIN') redirect('/login');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, include: { company: { select: { name: true } } } });

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[20px] font-extrabold text-ink">
          <UserCog size={18} className="text-brand" /> My account
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Your own login details — separate from your company&apos;s profile.</p>
      </div>
      <AccountClient user={{ email: user.email, phone: user.phone, role: user.role, companyName: user.company.name }} />
    </div>
  );
}
