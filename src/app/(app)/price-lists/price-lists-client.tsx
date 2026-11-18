'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Tags, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/components/current-user';
import { getPriceLists } from '@/actions/price-lists';
import { deleteCustomerPrice, setCustomerPrice } from '@/actions/pricing';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

export function PriceListsClient({ initial }: { initial: Awaited<ReturnType<typeof getPriceLists>> }) {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ['price-lists'], queryFn: () => getPriceLists(), initialData: initial });
  const [tab, setTab] = useState<'catalog' | 'customers'>('catalog');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const q = search.trim().toLowerCase();
  const catalog = useMemo(() => data.catalog.filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)), [data.catalog, q]);
  const specials = useMemo(() => data.specials.filter((s) => !q || s.customerName.toLowerCase().includes(q) || s.productName.toLowerCase().includes(q)), [data.specials, q]);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['price-lists'] }), qc.invalidateQueries({ queryKey: ['pricing'] })]);

  async function savePrice(id: string, s: (typeof data.specials)[number]) {
    const price = Number(edits[id]);
    if (!(price >= 0)) return toast.error('Enter a price of 0 or more.');
    const r = await setCustomerPrice({ customerId: s.customerId, productId: s.productId, unit: s.unit, price });
    if (r.error) return toast.error(r.error);
    toast.success(`${s.customerName}: ${s.productName} now ${fmtInr(price)}/${s.unit}`);
    setEdits(({ [id]: _, ...rest }) => rest);
    refresh();
  }

  async function remove(id: string, label: string) {
    const r = await deleteCustomerPrice(id);
    if (r.error) return toast.error(r.error);
    toast.success(`Removed ${label}. The catalog price applies again.`);
    refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
          <Tags size={18} className="text-brand" /> Price lists
        </h1>
        <p className="mt-1 max-w-[72ch] text-[12px] text-ink-faint">An order line takes the customer’s special price when there is one, otherwise the catalog price for that unit.</p>
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3">
          <div role="tablist" className="flex">
            {(
              [
                ['catalog', `Catalog prices · ${data.catalog.length}`],
                ['customers', `Customer prices · ${data.specials.length}`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('-mb-px border-b-2 px-3 py-2.5 text-[12.5px] font-bold', tab === k ? 'border-brand text-ink' : 'border-transparent text-ink-soft hover:text-ink')}>
                {l}
              </button>
            ))}
          </div>
          <div className="relative my-2 w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tab === 'catalog' ? 'Product or category' : 'Customer or product'} className="pl-8" />
          </div>
        </div>

        {tab === 'catalog' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-2.5 py-2.5">Unit prices</th>
                  <th className="px-4 py-2.5 text-right">Customer prices</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {catalog.map((p) => (
                  <tr key={p.id} className={cn(!p.active && 'opacity-60')}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-ink">{p.name}</div>
                      <div className="text-[11px] text-ink-faint">{p.category}</div>
                    </td>
                    <td className="px-2.5 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {p.tiers.map((t) => (
                          <span key={t.unit} className="rounded-sm2 bg-surface-alt px-2 py-0.5 font-mono text-[12px] text-ink">
                            {fmtInr(t.price)}/{t.unit}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-soft">{p.specialCount || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
              Change unit prices from the product in <Link href="/products" className="font-semibold text-brand">Products</Link>.
            </p>
          </div>
        ) : specials.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-faint">
            <Tags size={28} />
            <p className="text-[13.5px] font-bold text-ink-soft">No customer prices{q ? ' match' : ' yet'}.</p>
            {!q && (
              <p className="max-w-[46ch] text-[12px]">
                Set a special price from a customer’s page in <Link href="/customers" className="font-semibold text-brand">Customers</Link>.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-2.5 py-2.5">Product</th>
                  <th className="px-2.5 py-2.5 text-right">Catalog</th>
                  <th className="px-2.5 py-2.5 text-right">Their price</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {specials.map((s) => {
                  const diff = s.catalogPrice ? ((s.price - s.catalogPrice) / s.catalogPrice) * 100 : null;
                  const editing = s.id in edits;
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 font-semibold text-ink">{s.customerName}</td>
                      <td className="px-2.5 py-2.5 text-ink-soft">
                        {s.productName} <span className="text-ink-faint">/ {s.unit}</span>
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-mono tabular-nums text-ink-faint">{s.catalogPrice != null ? fmtInr(s.catalogPrice) : '—'}</td>
                      <td className="px-2.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Input
                            value={editing ? edits[s.id] : String(s.price)}
                            onChange={(e) => setEdits((m) => ({ ...m, [s.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && editing && savePrice(s.id, s)}
                            inputMode="decimal"
                            className="h-8 w-24 text-right font-mono"
                            aria-label={`${s.customerName} price for ${s.productName}`}
                          />
                          {editing && (
                            <button onClick={() => savePrice(s.id, s)} className="flex h-8 w-8 items-center justify-center rounded-sm2 bg-brand text-white" aria-label="Save price">
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                        {diff != null && Math.abs(diff) >= 0.05 && <div className={cn('mt-0.5 text-[11px]', diff < 0 ? 'text-green' : 'text-ink-faint')}>{diff < 0 ? `${Math.abs(diff).toFixed(1)}% below catalog` : `${diff.toFixed(1)}% above catalog`}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {me.isOwner && (
                          <button onClick={() => remove(s.id, `${s.customerName}’s price`)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-brand-light hover:text-brand" aria-label="Remove special price">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
