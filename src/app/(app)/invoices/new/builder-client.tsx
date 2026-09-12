'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ArrowLeft,
  Eye,
  FileText,
  CheckCircle2,
  ShoppingCart,
  ArrowRight,
  Share2,
  Printer,
  Mail,
  MessageCircle,
  Pencil,
  Package,
  Users,
  AlertTriangle,
  Sparkles,
  Box,
  Boxes,
  Snowflake,
  CloudFog,
  Clock,
  Tag,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { searchCustomersForBilling, getCustomerLedger } from '@/actions/customers';
import { createInvoice } from '@/actions/invoices';
import { frequentProductIdsForCustomer } from '@/actions/products';
import { useCreateCustomer } from '@/hooks/use-customers';
import { useCreateProduct } from '@/hooks/use-products';
import { computeTotals, fmtInr, type LineInput } from '@/lib/gst';
import { numberToWords } from '@/lib/number-to-words';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StateSelect } from '@/components/ui/location-field';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { hashColor, initials } from '@/lib/avatar';
import { PAPER_STYLE } from '@/lib/paper-theme';

type Product = { id: string; name: string; category: string; unit: string; price: string | number; hsn: string; packQty?: number | null };
type Company = {
  name: string;
  address: string;
  gstin: string;
  state: string;
  logoUrl?: string | null;
  bankName: string;
  bankAcc: string;
  ifsc: string;
  branch: string;
  upi: string | null;
  terms: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
};
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  state: string;
  guest: boolean;
  creditLimit?: string | number;
};
// productId is null for an ad-hoc/custom line item not backed by a catalog
// Product — lineId (stable, client-generated) is the real key everywhere
// since multiple custom lines would otherwise collide on a shared `null`.
type Line = { lineId: string; productId: string | null; name: string; hsn: string; unit: string; qty: number; rate: number; discount: number; packQty?: number | null };

const CATEGORY_TILE: Record<string, string> = {
  'Block ice': 'bg-chrome text-white',
  'Cube ice': 'bg-brand text-white',
  'Crushed ice': 'bg-surface-alt text-ink-body',
  'Dry ice': 'bg-brand-dark text-white',
};
const CATEGORY_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  'Block ice': Box,
  'Cube ice': Boxes,
  'Crushed ice': Snowflake,
  'Dry ice': CloudFog,
};

// Recovery-only local draft — the invoice itself is never persisted until
// it's actually saved server-side; this just survives an accidental
// refresh/close of this one tab.
const DRAFT_KEY = 'invozy_invoice_draft';

function categoryTile(cat: string) {
  return CATEGORY_TILE[cat] ?? 'bg-surface-alt text-ink-soft';
}
function CategoryIcon({ category, size = 15 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Package;
  return <Icon size={size} />;
}

export function BuilderClient({ products, company }: { products: Product[]; company: Company }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [discountValue, setDiscountValue] = useState(0);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [outstandingElsewhere, setOutstandingElsewhere] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const hydratedDraftRef = useRef(false);

  // Restore an unsaved draft left over from a refresh/accidental close, once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && ((draft.lines?.length ?? 0) > 0 || draft.customer)) {
          if (draft.customer) setCustomer(draft.customer);
          if (draft.lines) setLines(draft.lines);
          if (draft.discountType) setDiscountType(draft.discountType);
          if (typeof draft.discountValue === 'number') setDiscountValue(draft.discountValue);
          if (draft.date) setDate(draft.date);
          if (draft.due) setDue(draft.due);
          toast.info('Restored your unsaved invoice draft', {
            action: {
              label: 'Discard',
              onClick: () => {
                localStorage.removeItem(DRAFT_KEY);
                setCustomer(null);
                setLines([]);
                setDiscountType('PERCENT');
                setDiscountValue(0);
              },
            },
          });
        }
      }
    } catch {
      // corrupt/unavailable localStorage — proceed with a blank builder
    }
    hydratedDraftRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the draft in sync so a refresh/accidental close never loses it.
  useEffect(() => {
    if (!hydratedDraftRef.current) return;
    try {
      if (!customer && lines.length === 0) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ customer, lines, discountType, discountValue, date, due }));
      }
    } catch {
      // best-effort only
    }
  }, [customer, lines, discountType, discountValue, date, due]);

  useEffect(() => {
    if (customer) return;
    const t = setTimeout(() => {
      searchCustomersForBilling(custQuery).then(setCustResults);
    }, 200);
    return () => clearTimeout(t);
  }, [custQuery, customer]);

  useEffect(() => {
    if (!customer) {
      setFrequentIds([]);
      setOutstandingElsewhere(0);
      return;
    }
    frequentProductIdsForCustomer(customer.id).then(setFrequentIds);
    getCustomerLedger(customer.id).then((l) => setOutstandingElsewhere(l.outstanding));
  }, [customer]);

  const filteredProducts = useMemo(() => {
    const active = products.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase()));
    return active;
  }, [products, productQuery]);

  const frequentProducts = useMemo(() => {
    if (productQuery.trim() || frequentIds.length === 0) return [];
    return frequentIds.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  }, [frequentIds, products, productQuery]);

  const totals = useMemo(() => {
    const lineInputs: LineInput[] = lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount }));
    return computeTotals(
      lineInputs,
      { type: discountType, value: discountValue },
      {
        cgstRate: Number(company.cgstRate),
        sgstRate: Number(company.sgstRate),
        igstRate: Number(company.igstRate),
        cgstEnabled: company.cgstEnabled,
        sgstEnabled: company.sgstEnabled,
        igstEnabled: company.igstEnabled,
      },
      company.state,
      customer?.state ?? company.state
    );
  }, [lines, discountType, discountValue, company, customer]);

  const lineDiscountTotal = lines.reduce((s, l) => s + l.qty * l.rate * (l.discount / 100), 0);
  const totalSavings = lineDiscountTotal + totals.overallDiscountAmount;

  function addProduct(p: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      toast.success(`${p.name} added`);
      return [...prev, { lineId: crypto.randomUUID(), productId: p.id, name: p.name, hsn: p.hsn, unit: p.unit, qty: 1, rate: Number(p.price), discount: 0, packQty: p.packQty }];
    });
  }
  function decrementProductId(productId: string) {
    setLines((prev) => {
      const l = prev.find((x) => x.productId === productId);
      if (!l) return prev;
      if (l.qty <= 1) return prev.filter((x) => x.productId !== productId);
      return prev.map((x) => (x.productId === productId ? { ...x, qty: x.qty - 1 } : x));
    });
  }
  function addCustomLine(data: { name: string; hsn: string; unit: string; qty: number; rate: number; productId?: string }) {
    setLines((prev) => [
      ...prev,
      { lineId: crypto.randomUUID(), productId: data.productId ?? null, name: data.name, hsn: data.hsn, unit: data.unit, qty: data.qty, rate: data.rate, discount: 0 },
    ]);
    toast.success(`${data.name} added`);
  }
  function incrementLineQty(lineId: string) {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + 1 } : l)));
  }
  function decrementLineQty(lineId: string) {
    setLines((prev) => {
      const l = prev.find((x) => x.lineId === lineId);
      if (!l) return prev;
      if (l.qty <= 1) return prev.filter((x) => x.lineId !== lineId);
      return prev.map((x) => (x.lineId === lineId ? { ...x, qty: x.qty - 1 } : x));
    });
  }
  function updateLine(lineId: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
  }
  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }

  function save(markSent: boolean) {
    if (!customer) {
      setError('Select a customer first');
      toast.error('Select a customer first');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product');
      toast.error('Add at least one product');
      return;
    }
    setError(undefined);
    startSaving(async () => {
      const result = await createInvoice({
        customerId: customer.id,
        date,
        due,
        items: lines,
        overallDiscountType: discountType,
        overallDiscountValue: discountValue,
        markSent,
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      toast.success(markSent ? 'Invoice sent' : 'Saved as draft');
      if (result.invoiceId) {
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          // best-effort only
        }
        router.push(`/invoices/${result.invoiceId}`);
      }
    });
  }

  const hasCustomer = !!customer;
  const hasItems = lines.length > 0;
  const projectedBalance = outstandingElsewhere + totals.total;
  const creditLimit = Number(customer?.creditLimit ?? 0);
  const overLimit = creditLimit > 0 && projectedBalance >= creditLimit;

  const sheet = (
    <InvoiceSheet
      company={company}
      customer={customer}
      date={date}
      due={due}
      lines={lines}
      totals={totals}
      totalSavings={totalSavings}
      discountType={discountType}
      discountValue={discountValue}
      editable
      onDiscountTypeChange={setDiscountType}
      onDiscountValueChange={setDiscountValue}
      onIncrement={incrementLineQty}
      onDecrement={decrementLineQty}
      onUpdateLine={updateLine}
      onRemoveLine={removeLine}
    />
  );

  return (
    <>
      {/* Everything below is the interactive builder UI — collapsed to
          display:none at print time (not just visibility:hidden) so its
          height doesn't produce blank trailing pages; the dedicated
          print-only sheet is a sibling further down. */}
      <div className="print:hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
            <ArrowLeft size={13} /> Back
          </Button>
          <span className="font-mono text-[13px] font-semibold text-ink-soft">New invoice</span>
          <span className="rounded-full bg-surface-alt px-2.5 py-1 text-[11px] font-bold text-ink-soft">Draft</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-soft">
            <Clock size={12} /> Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none" />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-soft">
            <Clock size={12} /> Due
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none" />
          </div>
          <Button data-tour="preview-btn" variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye size={13} /> Preview
          </Button>
        </div>
      </div>

      <ProgressStepper hasCustomer={hasCustomer} hasItems={hasItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div className="flex flex-col gap-3.5">
          <div data-tour="bill-to" className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
              <Users size={13} className="text-brand" /> Bill to
            </div>
            {customer ? (
              <div className="flex items-center gap-2.5 rounded-lg2 border border-line bg-bg px-3 py-2.5">
                <span className="flex h-8.5 w-[34px] flex-shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold text-white" style={{ background: hashColor(customer.name) }}>
                  {initials(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-bold text-ink">
                    {customer.name}
                    {customer.guest && <span className="ml-1.5 rounded-full bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
                  </div>
                  <div className="truncate text-[11px] text-ink-faint">
                    {customer.phone ? customer.phone + ' · ' : ''}
                    {customer.state}
                  </div>
                </div>
                <Button variant="link" size="sm" className="flex-shrink-0 px-0" onClick={() => setCustomer(null)}>
                  Change
                </Button>
              </div>
            ) : showQuickAdd ? (
              <QuickAddCustomer
                query={custQuery}
                onCreated={(c) => {
                  setCustomer(c);
                  setShowQuickAdd(false);
                }}
                onCancel={() => setShowQuickAdd(false)}
              />
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
                  <Search size={14} className="flex-shrink-0 text-ink-faint" />
                  <input
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    placeholder="Name or mobile number…"
                    autoComplete="off"
                    className="w-full bg-transparent text-[13px] outline-none"
                  />
                </div>
                <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg2 border border-line bg-surface shadow-elevated">
                  {custResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCustomer(c)}
                      className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-brand-light"
                    >
                      <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-extrabold text-white" style={{ background: hashColor(c.name) }}>
                        {initials(c.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">{c.name}</span>
                      <span className="flex-shrink-0 text-[11px] text-ink-faint">{c.phone || c.state}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowQuickAdd(true)} className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2.5 text-left text-[12.5px] font-bold text-brand hover:bg-brand-light">
                    <Plus size={13} /> Add &quot;{custQuery || 'someone new'}&quot; as a new customer
                  </button>
                </div>
              </div>
            )}

            {customer && (
              <div className="mt-2.5 rounded-md2 bg-bg p-2.5 text-[12px] leading-relaxed text-ink-soft">
                <div className="text-[13px] font-bold text-ink">{customer.name}</div>
                {customer.address && <div>{customer.address}</div>}
                <div>
                  {customer.state} {customer.gstin ? `· GSTIN ${customer.gstin}` : '· unregistered'}
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-bold text-brand-dark">
                  {totals.useIgst ? `Different state — IGST ${company.igstRate}%` : `Same state — CGST ${company.cgstRate}% + SGST ${company.sgstRate}%`}
                </div>
                {overLimit ? (
                  <div className="mt-1.5 flex items-start gap-1.5 border-t border-dashed border-line pt-1.5 font-bold text-brand-dark">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> This invoice would put them at {fmtInr(projectedBalance)} — over their {fmtInr(creditLimit)} credit limit
                  </div>
                ) : (
                  outstandingElsewhere > 0.004 && (
                    <div className="mt-1.5 flex items-start gap-1.5 border-t border-dashed border-line pt-1.5 font-bold text-brand-dark">
                      <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> Already owes {fmtInr(outstandingElsewhere)} from other invoices
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div data-tour="add-products" className="rounded-xl2 border border-line bg-surface p-3.5 shadow-card">
            <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
              <Package size={13} className="text-brand" /> Add products
            </div>
            <div className="flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
              <Search size={14} className="flex-shrink-0 text-ink-faint" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search catalog to add…"
                autoComplete="off"
                className="w-full bg-transparent text-[13px] outline-none"
              />
            </div>
            <div className="mt-1.5 max-h-[420px] overflow-y-auto pr-1">
              {frequentProducts.length > 0 && (
                <>
                  <div className="px-2 pb-0.5 pt-0 text-[11px] font-bold text-brand-dark">
                    <Sparkles size={11} className="mr-1 inline" /> Frequently ordered by this customer
                  </div>
                  {frequentProducts.map((p) => (
                    <ProductRow key={p.id} product={p} qty={lines.find((l) => l.productId === p.id)?.qty ?? 0} onAdd={() => addProduct(p)} onDecrement={() => decrementProductId(p.id)} />
                  ))}
                  <div className="mt-2 border-t border-line px-2 pb-1 pt-2.5 text-[11px] text-ink-faint">All products (A–Z)</div>
                </>
              )}
              {filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-ink-faint">No active products found.</p>
              ) : (
                filteredProducts.map((p) => (
                  <ProductRow key={p.id} product={p} qty={lines.find((l) => l.productId === p.id)?.qty ?? 0} onAdd={() => addProduct(p)} onDecrement={() => decrementProductId(p.id)} />
                ))
              )}
            </div>
            <div data-tour="custom-item">
              {showCustomItemForm ? (
                <AddCustomItemForm
                  onAdd={addCustomLine}
                  onCancel={() => setShowCustomItemForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowCustomItemForm(true)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg2 border border-dashed border-line py-2 text-[11.5px] font-bold text-ink-faint hover:border-brand hover:text-brand"
                >
                  <Tag size={12} /> Bill something not in your catalog
                </button>
              )}
            </div>
          </div>
        </div>

        <div data-tour="invoice-sheet" className="relative max-w-[720px]" style={PAPER_STYLE}>
          <div className="h-[5px] rounded-t-lg2 bg-brand" />
          {sheet}
        </div>
      </div>

      {hasItems && (
        <div className="sticky bottom-[calc(60px+14px)] mt-3.5 flex flex-wrap items-center gap-2.5 rounded-full bg-chrome px-2.5 py-2.5 pl-4 text-white shadow-elevated md:bottom-3.5">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand">
            <ShoppingCart size={13} />
          </span>
          <span className="flex-1 text-[12px] font-semibold leading-tight">
            <b className="font-mono">{lines.length}</b> product{lines.length !== 1 ? 's' : ''} · <b className="font-mono">{lines.reduce((s, l) => s + l.qty, 0)}</b> unit
            {lines.reduce((s, l) => s + l.qty, 0) !== 1 ? 's' : ''} &nbsp;·&nbsp; <b className="font-mono">{fmtInr(totals.total)}</b>
          </span>
          <button onClick={() => setPreviewOpen(true)} className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-[11.5px] font-extrabold text-white">
            <ArrowRight size={12} /> View
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{error}</p>}

      <div data-tour="save-buttons" className="mt-3.5 flex flex-wrap justify-end gap-2.5">
        <Button variant="outline" onClick={() => save(false)} disabled={saving}>
          <FileText size={13} /> Save as draft
        </Button>
        <Button onClick={() => save(true)} disabled={saving}>
          <CheckCircle2 size={13} /> {saving ? 'Saving…' : 'Save & mark as sent'}
        </Button>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
        <AlertTriangle size={11} /> The invoice number is assigned the moment you save — nothing here is final until then.
      </p>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} className="text-brand" /> Invoice preview
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto" style={PAPER_STYLE}>
            <InvoiceSheet
              company={company}
              customer={customer}
              date={date}
              due={due}
              lines={lines}
              totals={totals}
              totalSavings={totalSavings}
              discountType={discountType}
              discountValue={discountValue}
              editable={false}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
              <Pencil size={12} /> Back to edit
            </Button>
            <Button variant="secondary" onClick={() => setShareOpen(true)} disabled={!customer}>
              <Share2 size={13} /> Share
            </Button>
            <Button onClick={() => window.print()}>
              <Printer size={13} /> Download / print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {customer && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          company={company}
          customer={customer}
          due={due}
          amountDue={totals.total}
        />
      )}
      </div>

      {/* Print/PDF source of truth — invisible on screen, shown only by the
          @media print rules in globals.css. A sibling of the print:hidden
          wrapper above (not inside the Dialog, which is `position: fixed`
          and breaks print pagination — fixed-position elements are
          repositioned per-page by the browser's print engine, which was
          producing garbled multi-page output; nor inside the print:hidden
          div itself, whose display:none would hide this too). Always
          reflects live state, so "Download / print" from the dialog just
          calls window.print(). */}
      <div className="invoice-print hidden print:block" style={PAPER_STYLE}>
        <InvoiceSheet
          company={company}
          customer={customer}
          date={date}
          due={due}
          lines={lines}
          totals={totals}
          totalSavings={totalSavings}
          discountType={discountType}
          discountValue={discountValue}
          editable={false}
        />
      </div>
    </>
  );
}

function ProgressStepper({ hasCustomer, hasItems }: { hasCustomer: boolean; hasItems: boolean }) {
  const steps = [
    { label: 'Customer', done: hasCustomer },
    { label: 'Items', done: hasItems },
    { label: 'Review & send', done: hasCustomer && hasItems },
  ];
  return (
    <div className="mb-4 flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-1 items-center gap-1.5 last:flex-none">
          <div className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold transition-all duration-200 ${
                s.done ? 'scale-105 bg-brand text-white' : 'bg-surface-alt text-ink-faint'
              }`}
            >
              {s.done ? <CheckCircle2 size={13} /> : i + 1}
            </span>
            <span className={`whitespace-nowrap text-[11.5px] font-bold transition-colors ${s.done ? 'text-ink' : 'text-ink-faint'}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className={`h-0.5 min-w-4 flex-1 rounded-full transition-colors duration-300 ${s.done ? 'bg-brand' : 'bg-line'}`} />}
        </div>
      ))}
    </div>
  );
}

function ProductRow({ product, qty, onAdd, onDecrement }: { product: Product; qty: number; onAdd: () => void; onDecrement: () => void }) {
  const perPiece = product.packQty && Number(product.packQty) > 0 ? fmtInr(Number(product.price) / Number(product.packQty)) + '/pc' : null;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg2 px-2 py-2 transition-colors hover:bg-bg ${qty > 0 ? 'bg-brand-light' : ''}`}>
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${categoryTile(product.category)}`}>
        <CategoryIcon category={product.category} size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-bold text-ink">{product.name}</div>
        <div className="text-[11px] text-ink-faint">
          {fmtInr(Number(product.price))} / {product.unit}
          {perPiece ? ` · ≈${perPiece}` : ''}
        </div>
      </div>
      {qty > 0 ? (
        <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-brand bg-surface p-0.5">
          <button onClick={onDecrement} aria-label={`Decrease ${product.name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <Minus size={11} />
          </button>
          <span key={qty} className="w-5 animate-bump text-center font-mono text-[12px] font-extrabold">
            {qty}
          </span>
          <button onClick={onAdd} aria-label={`Increase ${product.name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <Plus size={11} />
          </button>
        </div>
      ) : (
        <button onClick={onAdd} className="flex flex-shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-[11.5px] font-extrabold text-white">
          <Plus size={12} /> Add
        </button>
      )}
    </div>
  );
}

function AddCustomItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { name: string; hsn: string; unit: string; qty: number; rate: number; productId?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [hsn, setHsn] = useState('');
  const [unit, setUnit] = useState('pc');
  const [qty, setQty] = useState('1');
  const [rate, setRate] = useState('');
  const [saveAsProduct, setSaveAsProduct] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const createProduct = useCreateProduct();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qtyNum = parseFloat(qty) || 0;
    const rateNum = parseFloat(rate) || 0;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (qtyNum <= 0) {
      setError('Quantity must be greater than zero');
      return;
    }
    setError(undefined);

    let productId: string | undefined;
    if (saveAsProduct) {
      const formData = new FormData();
      formData.set('name', name.trim());
      formData.set('category', 'Uncategorized');
      formData.set('unit', unit.trim() || 'pc');
      formData.set('price', String(rateNum));
      if (hsn.trim()) formData.set('hsn', hsn.trim());
      const result = await createProduct.mutateAsync(formData);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      productId = result.id;
      toast.success('Added to your catalog too');
    }

    onAdd({ name: name.trim(), hsn: hsn.trim(), unit: unit.trim() || 'pc', qty: qtyNum, rate: rateNum, productId });
    setName('');
    setHsn('');
    setUnit('pc');
    setQty('1');
    setRate('');
    setSaveAsProduct(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg2 border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pc, kg, box…" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="HSN (optional)" name="hsn" value={hsn} onChange={(e) => setHsn(e.target.value)} mono />
        <Field label="Qty" name="qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} mono />
        <Field label="Rate (₹)" name="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} mono />
      </div>
      {!hsn.trim() && (
        <p className="flex items-start gap-1.5 text-[10.5px] text-ink-faint">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-gold" /> No HSN — you may need one for GST filing, but it&apos;s not required to bill.
        </p>
      )}
      <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
        <input type="checkbox" checked={saveAsProduct} onChange={(e) => setSaveAsProduct(e.target.checked)} className="h-3.5 w-3.5 rounded-sm2 border-line accent-brand" />
        Save this as a product for next time
      </label>
      {error && <p className="text-[11.5px] font-bold text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 justify-center" onClick={onCancel}>
          <X size={12} /> Cancel
        </Button>
        <Button type="submit" size="sm" className="flex-1 justify-center" disabled={createProduct.isPending}>
          <Plus size={12} /> {createProduct.isPending ? 'Adding…' : 'Add to invoice'}
        </Button>
      </div>
    </form>
  );
}

function QuickAddCustomer({ query, onCreated, onCancel }: { query: string; onCreated: (c: Customer) => void; onCancel: () => void }) {
  const looksLikePhone = /^[\d\s+()-]{5,}$/.test(query.trim());
  const createCustomer = useCreateCustomer();
  const [error, setError] = useState<string | undefined>();
  const [quickAddState, setQuickAddState] = useState('Tamil Nadu');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const guest = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-guest') === 'true';
    const result = await createCustomer.mutateAsync({ guest, formData });
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    onCreated({
      id: result.id!,
      name: String(formData.get('name')),
      phone: String(formData.get('phone') || ''),
      email: String(formData.get('email') || ''),
      address: String(formData.get('address') || ''),
      gstin: String(formData.get('gstin') || ''),
      state: String(formData.get('state')),
      guest,
      creditLimit: Number(formData.get('creditLimit') || 0),
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-lg2 border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" name="name" defaultValue={looksLikePhone ? '' : query} />
        <Field label="Mobile" name="phone" defaultValue={looksLikePhone ? query : ''} />
      </div>
      <StateSelect name="state" value={quickAddState} onChange={setQuickAddState} />
      {error && <p className="text-[11.5px] font-bold text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 justify-center" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" data-guest="true" variant="outline" size="sm" className="flex-1 justify-center" disabled={createCustomer.isPending}>
          Use once
        </Button>
        <Button type="submit" data-guest="false" size="sm" className="flex-1 justify-center" disabled={createCustomer.isPending}>
          Save customer
        </Button>
      </div>
    </form>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  company,
  customer,
  due,
  amountDue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
  customer: Customer;
  due: string;
  amountDue: number;
}) {
  const message = `Invoice from ${company.name}\nBill to: ${customer.name}\nAmount due: ${fmtInr(amountDue)}\nDue date: ${due}\n\nThank you for your business!`;
  const waDigits = (customer.phone || '').replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}`;
  const mailUrl = `mailto:${customer.email || ''}?subject=${encodeURIComponent('Invoice from ' + company.name)}&body=${encodeURIComponent(message)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 size={16} className="text-brand" /> Share invoice
          </DialogTitle>
        </DialogHeader>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">Sends a text summary of the invoice — for the full document, use Download / print first and attach that.</p>
        <div className="flex flex-col gap-2.5">
          <a href={waUrl} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 rounded-full bg-surface-alt px-4 py-2.5 text-[13px] font-bold text-ink">
            <MessageCircle size={14} /> Share via WhatsApp{waDigits ? '' : ' (no phone on file)'}
          </a>
          <a href={mailUrl} className="flex items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-[13px] font-bold text-ink">
            <Mail size={14} /> Share via Email{customer.email ? '' : ' (no email on file)'}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
