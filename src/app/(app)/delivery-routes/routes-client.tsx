'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Route } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OrderStatusPill } from '@/components/orders/order-meta';
import { useCurrentUser } from '@/components/current-user';
import { useModules } from '@/components/modules/modules-provider';
import { listRoutes, renameRoute, type RouteRow } from '@/actions/routes';
import { fmtInr } from '@/lib/gst';
import type { OrderStatus } from '@prisma/client';

export function RoutesClient({ initial }: { initial: Awaited<ReturnType<typeof listRoutes>> }) {
  const me = useCurrentUser();
  const reportsOn = useModules().enabled('reports');
  const qc = useQueryClient();
  const { data = initial } = useQuery({ queryKey: ['routes'], queryFn: () => listRoutes(), initialData: initial });
  const [renaming, setRenaming] = useState<RouteRow | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[16px] font-extrabold text-ink sm:text-[17px]">
            <Route size={18} className="text-brand" /> Delivery routes
          </h1>
          <p className="mt-1 max-w-[70ch] text-[12px] text-ink-faint">Customers and their open orders, grouped by the route set on each customer.</p>
        </div>
        {reportsOn && (
          <Button variant="outline" asChild>
            <Link href="/reports/loading-sheet">
              <ClipboardList size={13} /> Today’s loading sheet
            </Link>
          </Button>
        )}
      </div>

      {data.routes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl2 border border-line bg-surface px-6 py-14 text-center text-ink-faint shadow-card">
          <Route size={28} />
          <p className="text-[13.5px] font-bold text-ink-soft">No routes yet.</p>
          <p className="max-w-[46ch] text-[12px]">
            Set a route on customers in <Link href="/customers" className="font-semibold text-brand">Customers</Link>, for example “Harbour” or “City south”.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.routes.map((r) => (
            <section key={r.route} className="rounded-xl2 border border-line bg-surface shadow-card">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-[14px] font-bold text-ink">{r.route}</h2>
                  <p className="text-[11.5px] text-ink-faint">
                    {r.customers.length} customer{r.customers.length === 1 ? '' : 's'} · {r.openOrders.length} open order{r.openOrders.length === 1 ? '' : 's'}
                    {r.openValue > 0 ? ` · ${fmtInr(r.openValue)}` : ''}
                  </p>
                </div>
                {me.isOwner && (
                  <button onClick={() => setRenaming(r)} className="flex h-8 w-8 items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt hover:text-ink" aria-label={`Rename ${r.route}`}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              {r.openOrders.length > 0 && (
                <ul className="divide-y divide-line border-b border-line">
                  {r.openOrders.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-4 py-2">
                      <Link href={`/orders/${o.id}`} className="font-mono text-[12px] font-bold text-ink hover:text-brand">
                        {o.number}
                      </Link>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                        {o.customer}
                        {o.slot ? ` · ${o.slot}` : ''}
                      </span>
                      <OrderStatusPill status={o.status as OrderStatus} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-4 py-2.5 text-[12px] leading-relaxed text-ink-soft">{r.customers.map((c) => c.name).join(', ')}</p>
            </section>
          ))}
        </div>
      )}
      {data.unrouted > 0 && <p className="mt-3 text-[12px] text-ink-faint">{data.unrouted} active customer{data.unrouted === 1 ? ' has' : 's have'} no route yet.</p>}

      <RenameDialog
        target={renaming}
        onClose={() => setRenaming(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ['routes'] })}
      />
    </div>
  );
}

function RenameDialog({ target, onClose, onDone }: { target: RouteRow | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [for_, setFor] = useState<string | null>(null);
  if ((target?.route ?? null) !== for_) {
    setFor(target?.route ?? null);
    setName(target?.route ?? '');
  }
  async function save() {
    if (!target) return;
    setBusy(true);
    const r = await renameRoute({ from: target.route, to: name });
    setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success(`Renamed on ${r.moved} customer${r.moved === 1 ? '' : 's'}`);
    onDone();
    onClose();
  }
  return (
    <Dialog open={target !== null} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rename {target?.route}</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
        <p className="text-[12px] text-ink-faint">Changes the route on every customer on it. Two routes renamed to the same name become one.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim() || name.trim() === target?.route}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
