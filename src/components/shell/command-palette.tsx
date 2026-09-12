'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Package,
  Users,
  Receipt,
  BarChart3,
  Plus,
  Search,
} from 'lucide-react';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { fmtInr } from '@/lib/gst';
import { Skeleton } from '@/components/ui/skeleton';

type Action = { key: string; name: string; hint: string; icon: React.ReactNode; run: () => void };

export function CommandPalette({
  onOpenQuickAddProduct,
  onOpenQuickAddCustomer,
}: {
  onOpenQuickAddProduct: () => void;
  onOpenQuickAddCustomer: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isFetching } = useGlobalSearch(query);

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    }
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      } else if (!open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        router.push('/invoices/new');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, router]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const actions: Action[] = useMemo(
    () => [
      { key: 'dashboard', name: 'Go to Dashboard', hint: 'Page', icon: <LayoutDashboard size={15} />, run: () => router.push('/dashboard') },
      { key: 'company', name: 'Go to Company', hint: 'Page', icon: <Building2 size={15} />, run: () => router.push('/company') },
      { key: 'products', name: 'Go to Products', hint: 'Page', icon: <Package size={15} />, run: () => router.push('/products') },
      { key: 'customers', name: 'Go to Customers', hint: 'Page', icon: <Users size={15} />, run: () => router.push('/customers') },
      { key: 'invoices', name: 'Go to Invoices', hint: 'Page', icon: <Receipt size={15} />, run: () => router.push('/invoices') },
      { key: 'reports', name: 'Go to Reports', hint: 'Page', icon: <BarChart3 size={15} />, run: () => router.push('/reports') },
      { key: 'new-invoice', name: 'New invoice', hint: 'Shortcut', icon: <Plus size={15} />, run: () => router.push('/invoices/new') },
      { key: 'add-product', name: 'Add product', hint: 'Action', icon: <Package size={15} />, run: onOpenQuickAddProduct },
      { key: 'add-customer', name: 'Add customer', hint: 'Action', icon: <Users size={15} />, run: onOpenQuickAddCustomer },
    ],
    [router, onOpenQuickAddProduct, onOpenQuickAddCustomer]
  );

  const q = query.trim().toLowerCase();
  const matchedActions = actions.filter((a) => !q || a.name.toLowerCase().includes(q));
  const matchedProducts = q ? data?.products ?? [] : [];
  const matchedCustomers = q ? data?.customers ?? [] : [];
  const matchedInvoices = q ? data?.invoices ?? [] : [];

  type Row = { type: 'action'; action: Action } | { type: 'product' | 'customer' | 'invoice'; item: any };
  const rows: Row[] = [
    ...matchedActions.map((action) => ({ type: 'action' as const, action })),
    ...matchedProducts.map((item: any) => ({ type: 'product' as const, item })),
    ...matchedCustomers.map((item: any) => ({ type: 'customer' as const, item })),
    ...matchedInvoices.map((item: any) => ({ type: 'invoice' as const, item })),
  ];

  function runRow(row: Row) {
    setOpen(false);
    if (row.type === 'action') row.action.run();
    else if (row.type === 'product') router.push('/products');
    else if (row.type === 'customer') router.push('/customers');
    else if (row.type === 'invoice') router.push(`/invoices/${row.item.id}`);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center bg-black/70 px-4 pb-4 pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="flex max-h-[74vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl2 bg-surface shadow-elevated">
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-5 py-4">
          <Search size={16} className="flex-shrink-0 text-brand" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to anything…"
            autoComplete="off"
            className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (rows[activeIndex]) runRow(rows[activeIndex]);
              }
            }}
          />
          <span className="flex-shrink-0 rounded-sm2 border border-line px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">ESC</span>
        </div>
        <div className="overflow-y-auto p-2">
          {matchedActions.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Go to / actions</div>
              {matchedActions.map((a) => {
                const idx = rows.findIndex((r) => r.type === 'action' && r.action.key === a.key);
                return <PaletteRow key={a.key} icon={a.icon} name={a.name} hint={a.hint} active={idx === activeIndex} onClick={() => runRow(rows[idx])} onHover={() => setActiveIndex(idx)} />;
              })}
            </>
          )}
          {matchedProducts.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Products</div>
              {matchedProducts.map((p: any) => {
                const idx = rows.findIndex((r) => r.type === 'product' && r.item.id === p.id);
                return <PaletteRow key={p.id} icon={<Package size={15} />} name={p.name} hint={fmtInr(Number(p.price))} active={idx === activeIndex} onClick={() => runRow(rows[idx])} onHover={() => setActiveIndex(idx)} />;
              })}
            </>
          )}
          {matchedCustomers.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Customers</div>
              {matchedCustomers.map((c: any) => {
                const idx = rows.findIndex((r) => r.type === 'customer' && r.item.id === c.id);
                return <PaletteRow key={c.id} icon={<Users size={15} />} name={c.name} hint={c.state} active={idx === activeIndex} onClick={() => runRow(rows[idx])} onHover={() => setActiveIndex(idx)} />;
              })}
            </>
          )}
          {matchedInvoices.length > 0 && (
            <>
              <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">Invoices</div>
              {matchedInvoices.map((inv: any) => {
                const idx = rows.findIndex((r) => r.type === 'invoice' && r.item.id === inv.id);
                return <PaletteRow key={inv.id} icon={<Receipt size={15} />} name={inv.number} hint={inv.status} active={idx === activeIndex} onClick={() => runRow(rows[idx])} onHover={() => setActiveIndex(idx)} />;
              })}
            </>
          )}
          {q && isFetching && !data && (
            // Only for the very first search of this palette session — once
            // placeholderData carries over from a prior query, the stale
            // results stay visible while the next one fetches instead of
            // flickering to a skeleton and back.
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-8 w-8 flex-shrink-0 rounded-sm2" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          )}
          {q && !isFetching && rows.length === matchedActions.length && matchedProducts.length === 0 && matchedCustomers.length === 0 && matchedInvoices.length === 0 && (
            <div className="p-9 text-center text-[12.5px] text-ink-faint">No matches for &quot;{query}&quot;</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  icon,
  name,
  hint,
  active,
  onClick,
  onHover,
}: {
  icon: React.ReactNode;
  name: string;
  hint?: string;
  active: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={onHover}
      className={`flex cursor-pointer items-center gap-3 rounded-md2 px-3 py-2.5 ${active ? 'bg-brand-light' : ''}`}
    >
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 ${active ? 'bg-brand text-white' : 'bg-surface-alt text-ink-soft'}`}>{icon}</span>
      <span className="flex-1 truncate text-[13px] font-bold text-ink">{name}</span>
      {hint && <span className="flex-shrink-0 text-[11px] text-ink-faint">{hint}</span>}
    </div>
  );
}
