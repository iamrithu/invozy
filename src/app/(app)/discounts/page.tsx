import type { Metadata } from 'next';
import { BadgePercent } from 'lucide-react';
import { listAllSchemes, listCoupons } from '@/actions/coupons';
import { listCustomerGroupOptions } from '@/actions/customer-groups';
import { APP_NAME } from '@/lib/brand';
import { DiscountsClient } from './discounts-client';

export const metadata: Metadata = { title: `Discounts — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function DiscountsPage() {
  const [automatic, schemes, groups] = await Promise.all([listCoupons({ automatic: true }), listAllSchemes(), listCustomerGroupOptions()]);
  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <BadgePercent size={18} className="text-brand" /> Discounts
        </h1>
        <p className="mt-1 max-w-[72ch] text-[12px] text-ink-faint">Offers that apply without a code. The best qualifying automatic discount comes off first; a coupon can stack on it only if it allows that.</p>
      </div>
      <DiscountsClient automatic={automatic} schemes={schemes} groups={groups} />
    </div>
  );
}
