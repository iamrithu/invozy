import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UserCog } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getCompany } from '@/lib/get-company';
import { AccountClient } from './account-client';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `My account — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  // Both are cache()d per request — the app layout already ran them, so
  // this page costs no extra queries.
  const [user, company] = await Promise.all([requireUser().catch(() => null), getCompany().catch(() => null)]);
  if (!user || !company) redirect('/login');

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
          <UserCog size={18} className="text-brand" /> My account
        </h1>
        <p className="mt-1 text-[12px] text-ink-faint">Your own login details — separate from your company&apos;s profile.</p>
      </div>
      <AccountClient user={{ name: user.name, email: user.email, phone: user.phone, role: user.role, companyName: company.name }} />
    </div>
  );
}
