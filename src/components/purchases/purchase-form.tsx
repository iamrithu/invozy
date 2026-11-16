'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Info, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCurrentUser } from '@/components/current-user';
import { ProductPicker } from '@/components/inventory/product-picker';
import { SupplierFormDialog } from './supplier-form-dialog';
import { AttachmentsField, type PendingAttachments } from './attachments-field';
import { uploadAttachment } from './upload-attachment';
import { computePurchaseTotals, lineAmount, PURCHASE_ATTACHMENT_MAX_BYTES } from './purchase-math';
import { decidesIgst, fmtInr, formatUnit } from '@/lib/gst';
import { todayIst } from '@/lib/dates';
import { formatStock, round6, stockUnits, unitFactor } from '@/lib/stock-units';
import { cn } from '@/lib/utils';
import { useDeletePurchase, useSavePurchase } from '@/hooks/use-purchases';
import type { StockProduct } from '@/actions/inventory';
import { discardPurchaseUploads, type PurchaseAttachmentInfo, type PurchaseDetail } from '@/actions/purchases';
import type { SupplierOption } from '@/actions/suppliers';

type Line = {
  key: string;
  productId: string | null;
  name: string;
  unit: string;
  qty: string;
  rate: string;
  gstRate: string;
  batchNo: string;
  expiryDate: string;
};

type LastRates = Record<string, Record<string, { rate: number; gstRate: number }>>;

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

const fieldClass =
  'h-9 w-full rounded-sm2 border border-border bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20';

/** The purchase (supplier bill) editor, for both /purchases/new and
 * /purchases/[id]. Lines come from the catalog: pick a product, then its
 * unit (from the product's own pricing units), quantity, rate and GST % —
 * pre-filled from the last time it was bought. Saving posts the stock change
 * in the same transaction as the bill. */
export function PurchaseForm({
  purchase,
  prefill,
  products,
  suppliers: initialSuppliers,
  lastRates,
  company,
  directUploads,
}: {
  purchase: PurchaseDetail | null;
  /** A new bill's starting supplier and lines (from the reorder card). */
  prefill?: { supplierId: string | null; lines: { productId: string; qty: number }[] };
  products: StockProduct[];
  suppliers: SupplierOption[];
  lastRates: LastRates;
  company: { state: string; currency: string; defaultGstRate: number };
  /** Blob storage is connected — attachments upload straight to it. */
  /** The company's Blob folder for bill attachments, or null without Blob storage. */
  directUploads: string | null;
}) {
  const router = useRouter();
  const { isOwner } = useCurrentUser();
  const save = useSavePurchase();
  const del = useDeletePurchase();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(purchase?.supplierId ?? prefill?.supplierId ?? '');
  const [billNo, setBillNo] = useState(purchase?.billNo ?? '');
  const [date, setDate] = useState(purchase?.date ?? todayIst());
  const [notes, setNotes] = useState(purchase?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    !purchase && prefill?.lines.length
      ? prefill.lines.flatMap((l) => {
          const p = products.find((x) => x.id === l.productId);
          if (!p) return [];
          const last = lastRates[p.id]?.[p.unit.trim().toLowerCase()];
          return [
            {
              key: nextKey(),
              productId: p.id,
              name: p.name,
              unit: p.unit,
              qty: String(l.qty),
              rate: last ? String(last.rate) : '',
              gstRate: String(last?.gstRate ?? company.defaultGstRate),
              batchNo: '',
              expiryDate: '',
            },
          ];
        })
      : (purchase?.items ?? []).map((it) => ({
      key: nextKey(),
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      qty: String(it.qty),
      rate: String(it.rate),
      gstRate: String(it.gstRate),
      batchNo: it.batchNo ?? '',
      expiryDate: it.expiryDate ?? '',
    }))
  );
  const [attachments, setAttachments] = useState<PendingAttachments>({ existing: purchase?.attachments ?? [], files: [] });
  // "Uploading 2 of 3…" while new attachments go up, before the save itself.
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const busy = save.isPending || uploadStep !== null;
  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const interState = supplier ? decidesIgst(company.state, supplier.state || company.state, true) : false;
  const numericLines = lines.map((l) => ({ qty: Number(l.qty) || 0, rate: Number(l.rate) || 0, gstRate: Number(l.gstRate) || 0 }));
  const totals = computePurchaseTotals(numericLines, interState);

  function lastRate(productId: string, unit: string) {
    return lastRates[productId]?.[unit.trim().toLowerCase()];
  }

  function addLine(p: StockProduct) {
    const last = lastRate(p.id, p.unit);
    const key = nextKey();
    setLines((ls) => [
      ...ls,
      {
        key,
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty: '',
        rate: last ? String(last.rate) : '',
        gstRate: String(last?.gstRate ?? company.defaultGstRate),
        batchNo: '',
        expiryDate: '',
      },
    ]);
    // Straight to the quantity — the next thing anyone types.
    requestAnimationFrame(() => document.getElementById(`qty-${key}`)?.focus());
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function changeUnit(l: Line, unit: string) {
    const last = l.productId ? lastRate(l.productId, unit) : undefined;
    update(l.key, { unit, ...(last ? { rate: String(last.rate) } : {}) });
  }

  async function submit() {
    if (!supplierId) return toast.error('Pick the supplier this bill is from.');
    if (!lines.length) return toast.error('Add at least one product to the bill.');
    const bad = lines.find((l) => !(Number(l.qty) > 0) || l.rate.trim() === '' || !(Number(l.rate) >= 0));
    if (bad) return toast.error(`Check the quantity and rate for ${bad.name}.`);
    // New files go up one at a time (see uploadAttachment), then the bill
    // is saved pointing at them. If anything fails, the ones already
    // uploaded are deleted again.
    const uploaded: PurchaseAttachmentInfo[] = [];
    try {
      for (const [i, file] of attachments.files.entries()) {
        setUploadStep(`Uploading ${i + 1} of ${attachments.files.length}…`);
        uploaded.push(await uploadAttachment(file, directUploads));
      }
      setUploadStep(null);
      await save.mutateAsync({
        id: purchase?.id ?? null,
        input: {
          supplierId,
          billNo,
          date,
          notes,
          items: lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            unit: l.unit,
            qty: Number(l.qty),
            rate: Number(l.rate),
            gstRate: Number(l.gstRate) || 0,
            batchNo: l.batchNo,
            expiryDate: l.expiryDate || null,
          })),
          attachments: [...attachments.existing, ...uploaded],
        },
      });
      toast.success(purchase ? 'Purchase saved — stock updated' : 'Purchase recorded — stock added');
      router.push('/purchases');
    } catch (e) {
      if (uploaded.length) void discardPurchaseUploads(uploaded.map((a) => a.url));
      toast.error((e as Error).message);
    } finally {
      setUploadStep(null);
    }
  }

  async function remove() {
    if (!purchase) return;
    try {
      await del.mutateAsync(purchase.id);
      toast.success('Purchase deleted — its stock was taken back out');
      router.push('/purchases');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleteOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/purchases">
          <ArrowLeft size={14} /> Purchases
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[18px] sm:text-[20px] font-extrabold text-ink">
            <ShoppingCart size={18} className="text-brand" /> {purchase ? 'Edit purchase' : 'New purchase'}
          </h1>
          <p className="mt-1 text-[12px] text-ink-faint">A supplier bill. Saving adds its products to stock and records the input GST.</p>
        </div>
        {purchase && isOwner && (
          <Button variant="outline" className="border-red-soft text-red hover:bg-red-soft" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={13} /> Delete
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl2 border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Label>Supplier</Label>
          <div className="flex gap-2">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger aria-label="Supplier" className="flex-1">
                <SelectValue placeholder="Pick a supplier" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {suppliers.length === 0 && <div className="px-2 py-3 text-[12px] text-ink-faint">No suppliers yet — add one.</div>}
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {!s.active ? ' (disabled)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={() => setSupplierFormOpen(true)} aria-label="Add a new supplier">
              <Plus size={13} /> New
            </Button>
          </div>
          {supplier && (
            <p className="mt-1 text-[11px] text-ink-faint">
              {[supplier.state, supplier.gstin].filter(Boolean).join(' · ') || 'No state set'} · {interState ? 'Inter-state: IGST' : 'Same state: CGST + SGST'}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="bill-no">Supplier bill no.</Label>
          <Input id="bill-no" value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. CM-7802" className="font-mono" />
        </div>
        <div>
          <Label htmlFor="bill-date">Bill date</Label>
          <Input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label htmlFor="bill-notes">Notes (optional)</Label>
          <Textarea id="bill-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[38px]" placeholder="Anything to remember about this delivery" />
        </div>
      </div>

      <div className="rounded-xl2 border border-line bg-surface shadow-card">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_96px_76px_96px_68px_104px_136px_96px_32px] gap-2 border-b border-line bg-surface-alt px-4 py-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint lg:grid">
          <span>Product</span>
          <span>Unit</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">GST %</span>
          <span>Batch no.</span>
          <span>Expiry</span>
          <span className="text-right">Amount</span>
          <span />
        </div>

        {lines.length === 0 && <div className="px-4 py-8 text-center text-[12.5px] text-ink-faint">Search below to add the products on this bill.</div>}

        <div className="divide-y divide-line">
          {lines.map((l) => {
            const p = l.productId ? productById.get(l.productId) : undefined;
            const units = p ? stockUnits(p) : [l.unit];
            const qty = Number(l.qty);
            const main = p && qty > 0 ? round6(qty * unitFactor(p, l.unit)) : 0;
            const showMain = p && qty > 0 && l.unit.trim().toLowerCase() !== p.unit.trim().toLowerCase();
            return (
              <div
                key={l.key}
                className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 lg:grid-cols-[minmax(0,2.2fr)_96px_76px_96px_68px_104px_136px_96px_32px] lg:items-center"
              >
                <div className="col-span-2 min-w-0 sm:col-span-4 lg:col-span-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-ink">{l.name}</div>
                      {!p ? (
                        <div className="text-[11px] text-ink-faint">Product removed from catalog — stock not updated</div>
                      ) : !p.trackStock ? (
                        <div className="flex items-center gap-1 text-[11px] text-gold">
                          <Info size={11} /> Not tracked — stock not updated
                        </div>
                      ) : showMain ? (
                        <div className="text-[11px] text-ink-faint">Adds {formatStock(main, p)}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${l.name}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="rounded-sm2 p-1 text-ink-faint hover:bg-red-soft hover:text-red lg:hidden"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <LineField label="Unit">
                  <select value={l.unit} disabled={units.length < 2} onChange={(e) => changeUnit(l, e.target.value)} aria-label="Unit" className={cn(fieldClass, 'disabled:opacity-100')}>
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {formatUnit(u)}
                      </option>
                    ))}
                  </select>
                </LineField>
                <LineField label="Qty">
                  <input id={`qty-${l.key}`} value={l.qty} inputMode="decimal" onChange={(e) => update(l.key, { qty: e.target.value })} aria-label="Quantity" className={cn(fieldClass, 'text-right font-mono')} />
                </LineField>
                <LineField label="Rate (₹)">
                  <input value={l.rate} inputMode="decimal" onChange={(e) => update(l.key, { rate: e.target.value })} aria-label="Rate" className={cn(fieldClass, 'text-right font-mono')} />
                </LineField>
                <LineField label="GST %">
                  <input value={l.gstRate} inputMode="decimal" onChange={(e) => update(l.key, { gstRate: e.target.value })} aria-label="GST percent" className={cn(fieldClass, 'text-right font-mono')} />
                </LineField>
                <LineField label="Batch no.">
                  <input value={l.batchNo} onChange={(e) => update(l.key, { batchNo: e.target.value })} aria-label="Batch number" placeholder="—" className={cn(fieldClass, 'font-mono')} />
                </LineField>
                <LineField label="Expiry">
                  <input type="date" value={l.expiryDate} onChange={(e) => update(l.key, { expiryDate: e.target.value })} aria-label="Expiry date" className={cn(fieldClass, 'px-2 text-[12px]')} />
                </LineField>
                <LineField label="Amount" className="text-right lg:text-right">
                  <div className="flex h-9 items-center justify-end font-mono text-[13px] font-bold text-ink">{fmtInr(lineAmount({ qty: Number(l.qty) || 0, rate: Number(l.rate) || 0 }), company.currency)}</div>
                </LineField>
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  className="hidden h-8 w-8 items-center justify-center rounded-sm2 text-ink-faint hover:bg-red-soft hover:text-red lg:flex"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="border-t border-line p-4">
          <ProductPicker products={products} onPick={addLine} placeholder="Add a product — type to search…" className="max-w-[440px]" />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <AttachmentsField
          value={attachments}
          onChange={setAttachments}
          maxBytes={directUploads ? PURCHASE_ATTACHMENT_MAX_BYTES : 4 * 1024 * 1024}
          canRemoveSaved={isOwner}
          disabled={busy}
          className="w-full lg:max-w-[600px]"
        />
        <div className="w-full rounded-xl2 border border-line bg-surface p-4 shadow-card lg:max-w-[360px]">
          <TotalRow label="Taxable value" value={fmtInr(totals.taxable, company.currency)} />
          {interState ? (
            <TotalRow label="Input IGST" value={fmtInr(totals.igst, company.currency)} />
          ) : (
            <>
              <TotalRow label="Input CGST" value={fmtInr(totals.cgst, company.currency)} />
              <TotalRow label="Input SGST" value={fmtInr(totals.sgst, company.currency)} />
            </>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5">
            <span className="text-[13px] font-extrabold text-ink">Bill total</span>
            <span className="font-mono text-[18px] font-extrabold text-ink">{fmtInr(totals.total, company.currency)}</span>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button asChild variant="ghost">
              <Link href="/purchases">Cancel</Link>
            </Button>
            <Button onClick={submit} disabled={busy}>
              <Check size={13} /> {uploadStep ?? (save.isPending ? 'Saving…' : purchase ? 'Save changes' : 'Save purchase')}
            </Button>
          </div>
        </div>
      </div>

      <SupplierFormDialog
        open={supplierFormOpen}
        onOpenChange={setSupplierFormOpen}
        defaultState={company.state}
        onSaved={(s) => {
          setSuppliers((list) => [...list, s].sort((a, b) => a.name.localeCompare(b.name)));
          setSupplierId(s.id);
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this purchase"
        description={`Its products come back out of stock. If some of that stock has already been sold, the delete is refused.${purchase?.attachments.length ? ' Its attached files are deleted too.' : ''} This can't be undone.`}
        confirmLabel="Delete purchase"
        pending={del.isPending}
        onConfirm={remove}
      />
    </div>
  );
}

/** A line's field — labelled on phones/tablets (stacked card), bare in the
 * desktop row where the header row labels the columns. */
function LineField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <span className="mb-1 block text-[10.5px] font-bold text-ink-faint lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-ink-soft">{label}</span>
      <span className="font-mono font-bold text-ink">{value}</span>
    </div>
  );
}
