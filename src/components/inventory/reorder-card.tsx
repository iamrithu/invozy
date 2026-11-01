'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUnit } from '@/lib/gst';
import type { ReorderSuggestions } from '@/actions/inventory';

const SHOWN = 5;

/** Products due to run out within the reorder lead time, each with an
 * editable order quantity (pre-filled from recent sales), and two ways to
 * act on it: a purchase bill pre-filled with these lines, or the order sent
 * to the supplier on WhatsApp. */
export function ReorderCard({ data, companyName }: { data: ReorderSuggestions; companyName: string }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(data.items.map((i) => [i.id, i.suggested])));
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? data.items : data.items.slice(0, SHOWN);
  const ordered = data.items.filter((i) => (qty[i.id] ?? 0) > 0);

  function bump(id: string, by: number) {
    setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + by) }));
  }

  function createBill() {
    const items = ordered.map((i) => `${i.id}:${qty[i.id]}`).join(',');
    router.push(`/purchases/new?items=${encodeURIComponent(items)}${data.supplier ? `&supplier=${data.supplier.id}` : ''}`);
  }

  function sendOrder() {
    const lines = ordered.map((i) => `• ${i.name} — ${qty[i.id]} ${formatUnit(i.unit)}`).join('\n');
    const text = `Hello${data.supplier ? ` ${data.supplier.name}` : ''}, order from ${companyName}:\n\n${lines}\n\nThank you!`;
    const digits = (data.supplier?.phone ?? '').replace(/\D/g, '');
    const to = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
  }

  return (
    <div className="mb-4 rounded-xl2 border border-red-soft bg-surface shadow-card">
      <div className="rounded-t-xl2 bg-red-soft px-3.5 py-3">
        <div className="text-[13.5px] font-extrabold text-ink">
          {data.items.length} product{data.items.length === 1 ? ' runs' : 's run'} out within {data.leadDays} days
        </div>
        <div className="mt-0.5 text-[12px] text-ink-soft">Quantities cover two lead times at your recent sales. Adjust, then order.</div>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3.5 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-bold text-ink">{i.name}</div>
              <div className={`text-[11px] font-semibold ${i.daysLeft < 3 ? 'text-red' : 'text-ink-soft'}`}>
                {i.stockText} left · about {Math.max(0, Math.floor(i.daysLeft))} day{Math.floor(i.daysLeft) === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center rounded-sm2 border border-line">
              <button type="button" aria-label={`Order less ${i.name}`} onClick={() => bump(i.id, -1)} className="h-8 w-8 text-ink-soft hover:text-ink">
                −
              </button>
              <input
                aria-label={`Order quantity for ${i.name}`}
                inputMode="numeric"
                value={qty[i.id] ?? 0}
                onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                className="h-8 w-10 bg-transparent text-center font-mono text-[12.5px] font-bold outline-none"
              />
              <button type="button" aria-label={`Order more ${i.name}`} onClick={() => bump(i.id, 1)} className="h-8 w-8 text-ink-soft hover:text-ink">
                +
              </button>
            </div>
            <span className="w-9 flex-shrink-0 text-[11px] text-ink-faint">{formatUnit(i.unit)}</span>
          </li>
        ))}
      </ul>
      {data.items.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-line py-2 text-[12px] font-bold text-brand hover:bg-bg">
          {showAll ? 'Show fewer' : `Show all ${data.items.length}`}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-3">
        <span className="mr-auto text-[12px] text-ink-soft">
          {data.supplier ? (
            <>
              From <b className="text-ink">{data.supplier.name}</b> — last bought from
            </>
          ) : (
            'Pick the supplier on the bill'
          )}
        </span>
        <Button type="button" variant="outline" onClick={sendOrder} disabled={!ordered.length}>
          <MessageCircle size={13} /> Send order on WhatsApp
        </Button>
        <Button type="button" onClick={createBill} disabled={!ordered.length}>
          <ShoppingCart size={13} /> Create purchase bill · {ordered.length}
        </Button>
      </div>
    </div>
  );
}
