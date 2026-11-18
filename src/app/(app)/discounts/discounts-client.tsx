'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { CouponsList } from '@/components/coupons/coupons-list';
import { useSchemesList, useSetSchemeActive } from '@/hooks/use-coupons';
import type { CouponRow, SchemeListRow } from '@/actions/coupons';
import { cn } from '@/lib/utils';

export function DiscountsClient({ automatic, schemes, groups }: { automatic: CouponRow[]; schemes: SchemeListRow[]; groups: { id: string; name: string }[] }) {
  const [tab, setTab] = useState<'auto' | 'schemes'>('auto');
  const { data: schemeRows = schemes } = useSchemesList(schemes);
  const setActive = useSetSchemeActive();

  return (
    <div>
      <div role="tablist" className="mb-4 flex border-b border-line">
        {[
          ['auto', 'Automatic'],
          ['schemes', 'Buy X get Y'],
        ].map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k as 'auto' | 'schemes')}
            className={cn('-mb-px border-b-2 px-3 py-2.5 text-[13px] font-bold', tab === k ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink')}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'auto' ? (
        <CouponsList automatic initial={automatic} groups={groups} />
      ) : schemeRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface px-6 py-14 text-center text-ink-faint shadow-card">
          <Gift size={28} />
          <p className="text-[13.5px] font-bold text-ink-soft">No Buy X get Y schemes yet.</p>
          <p className="max-w-[46ch] text-[12px]">
            Add one from a product’s Offers in <Link href="/products" className="font-semibold text-brand">Products</Link>. Orders and invoices suggest the free line once the quantity is reached.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-surface shadow-card">
          <table className="w-full min-w-[600px] text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5">Product</th>
                <th className="px-2.5 py-2.5">Scheme</th>
                <th className="px-2.5 py-2.5">Valid</th>
                <th className="px-4 py-2.5 text-right">On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {schemeRows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{s.productName}</div>
                    {s.name && <div className="text-[11.5px] text-ink-faint">{s.name}</div>}
                  </td>
                  <td className="px-2.5 py-3 text-ink">
                    Buy {s.buyQty} {s.unit}, get {s.freeQty} free
                  </td>
                  <td className="px-2.5 py-3 text-[12px] text-ink-soft">
                    {s.validFrom || s.validTo
                      ? `${s.validFrom ? new Date(s.validFrom).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Now'} – ${s.validTo ? new Date(s.validTo).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no end'}`
                      : 'Always'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Switch
                      checked={s.active}
                      aria-label={`${s.productName} scheme on`}
                      onChange={async (e) => {
                        try {
                          await setActive.mutateAsync({ id: s.id, active: e.target.checked });
                          toast.success(`Scheme switched ${e.target.checked ? 'on' : 'off'}`);
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
