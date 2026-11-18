import type { Metadata } from 'next';
import { TicketPercent } from 'lucide-react';
import { listCoupons } from '@/actions/coupons';
import { listCustomerGroupOptions } from '@/actions/customer-groups';
import { CouponsList } from '@/components/coupons/coupons-list';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Coupons — ${APP_NAME}` };
export const dynamic = 'force-dynamic';

export default async function CouponsPage() {
  const [coupons, groups] = await Promise.all([listCoupons({ automatic: false }), listCustomerGroupOptions()]);
  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <TicketPercent size={18} className="text-brand" /> Coupons
        </h1>
        <p className="mt-1 max-w-[72ch] text-[12px] text-ink-faint">Codes customers type at checkout, or staff type on an order. They come off before GST, after any automatic discount.</p>
      </div>
      <CouponsList automatic={false} initial={coupons} groups={groups} />
    </div>
  );
}
