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
  IndianRupee,
} from 'lucide-react';
import { toast } from 'sonner';
import { searchCustomersForBilling, getCustomerLedger } from '@/actions/customers';
import { createInvoice } from '@/actions/invoices';
import { frequentProductIdsForCustomer } from '@/actions/products';
import { useCreateCustomer } from '@/hooks/use-customers';
import { useCreateProduct } from '@/hooks/use-products';
import { computeTotals, fmtInr, type LineInput } from '@/lib/gst';
import { numberToWords } from '@/lib/number-to-words';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { StateSelect } from '@/components/ui/location-field';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceCompletenessChecklist } from '@/components/invoices/invoice-completeness-checklist';
import { hashColor, initials } from '@/lib/avatar';
import { PAPER_STYLE } from '@/lib/paper-theme';

type Product = { id: string; name: string; category: string; unit: string; price: string | number; packQty?: number | null; hsn?: string | null; altUnit?: string | null; altQtyPerUnit?: string | number | null };
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
  invoiceTemplate: 'MODERN' | 'CLASSIC';
  fssaiNo?: string | null;
  pincode?: string | null;
  pan?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  signatoryName?: string | null;
  signatureUrl?: string | null;
};
type Customer = {
  id: string;
  name: string;
  shopName?: string | null;
  phone: string | null;
  altPhone?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  state: string;
  guest: boolean;
  creditLimit?: string | number;
  contact?: string | null;
  fssaiNo?: string | null;
  pincode?: string | null;
};
// productId is null for an ad-hoc/custom line item not backed by a catalog
// Product — lineId (stable, client-generated) is the real key everywhere
// since multiple custom lines would otherwise collide on a shared `null`.
type Line = {
  lineId: string;
  productId: string | null;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  packQty?: number | null;
  hsn?: string | null;
  batch?: string | null;
  altUnit?: string | null;
  altQtyPerUnit?: number | null;
};

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
  const [custLoading, setCustLoading] = useState(false);
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
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
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
    setCustLoading(true);
    const t = setTimeout(() => {
      searchCustomersForBilling(custQuery)
        .then(setCustResults)
        .finally(() => setCustLoading(false));
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
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);

  // A product with a known pack size (packQty) can be billed as two
  // independent line items — e.g. "4 Box" and "30 pc" on the same invoice —
  // rather than one line with a fractional box qty. Keyed by (productId,
  // unit) so the box-line and the piece-line for the same product never
  // collide and increment independently.
  function addProductVariant(p: Product, variant: 'unit' | 'piece') {
    const unit = variant === 'unit' ? p.unit : 'pc';
    const rate = variant === 'unit' ? Number(p.price) : Number(p.price) / Number(p.packQty || 1);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id && l.unit === unit);
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      toast.success(`${p.name} added${variant === 'piece' ? ' (loose pc)' : ''}`);
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: p.id,
          name: p.name,
          unit,
          qty: 1,
          rate,
          discount: 0,
          packQty: variant === 'unit' ? p.packQty : null,
          hsn: p.hsn,
          altUnit: variant === 'unit' ? p.altUnit : null,
          altQtyPerUnit: variant === 'unit' && p.altQtyPerUnit ? Number(p.altQtyPerUnit) : null,
        },
      ];
    });
  }
  function decrementProductVariant(productId: string, unit: string) {
    setLines((prev) => {
      const l = prev.find((x) => x.productId === productId && x.unit === unit);
      if (!l) return prev;
      if (l.qty <= 1) return prev.filter((x) => x !== l);
      return prev.map((x) => (x === l ? { ...x, qty: x.qty - 1 } : x));
    });
  }
  function addCustomLine(data: { name: string; unit: string; qty: number; rate: number; productId?: string; packQty?: number | null }) {
    setLines((prev) => [
      ...prev,
      { lineId: crypto.randomUUID(), productId: data.productId ?? null, name: data.name, unit: data.unit, qty: data.qty, rate: data.rate, discount: 0, packQty: data.packQty ?? null },
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

  function save(mode: 'draft' | 'sent' | 'paid') {
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
        markSent: mode !== 'draft',
        markPaid: mode === 'paid',
      });
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      toast.success(mode === 'paid' ? 'Invoice saved as paid in full' : mode === 'sent' ? 'Invoice sent' : 'Saved as draft');
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

  const isClassic = company.invoiceTemplate === 'CLASSIC';

  const checklistItems = [
    { label: 'Company GSTIN', done: !!company.gstin, href: '/company' },
    { label: 'Company PAN', done: !!company.pan, href: '/company' },
    { label: 'Company FSSAI license no.', done: !!company.fssaiNo, href: '/company' },
    { label: 'Company logo', done: !!company.logoUrl, href: '/company' },
    { label: 'Bank details', done: !!(company.bankName && company.bankAcc && company.ifsc), href: '/company' },
    { label: 'Terms', done: !!company.terms, href: '/company' },
    { label: 'Authorised signatory (name or e-signature)', done: !!(company.signatoryName || company.signatureUrl), href: '/company' },
    ...(customer
      ? [
          { label: `${customer.name}'s GSTIN`, done: !!customer.gstin, href: '/customers' },
          { label: `${customer.name}'s contact / phone`, done: !!(customer.contact || customer.phone), href: '/customers' },
        ]
      : []),
    ...(lines.length > 0 ? [{ label: 'HSN/SAC code on every line item', done: lines.every((l) => !!l.hsn) }] : []),
  ];

  const sheet = isClassic ? (
    <InvoiceSheetClassic
      company={company}
      customer={customer}
      date={date}
      lines={lines}
      totals={totals}
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
  ) : (
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
                    {customer.shopName ? customer.shopName + ' · ' : ''}
                    {customer.phone ? customer.phone + ' · ' : ''}
                    {customer.state}
                  </div>
                </div>
                <Button variant="link" size="sm" className="flex-shrink-0 px-0" onClick={() => setEditCustomerOpen(true)}>
                  Edit
                </Button>
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
                  {custLoading ? (
                    <div className="space-y-1.5 p-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-1 py-1.5">
                          <Skeleton className="h-[30px] w-[30px] flex-shrink-0 rounded-full" />
                          <Skeleton className="h-3 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    custResults.map((c) => (
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
                    ))
                  )}
                  <button onClick={() => setShowQuickAdd(true)} className="flex w-full items-center gap-1.5 border-t border-line px-3 py-2.5 text-left text-[12.5px] font-bold text-brand hover:bg-brand-light">
                    <Plus size={13} /> Add &quot;{custQuery || 'someone new'}&quot; as a new customer
                  </button>
                </div>
              </div>
            )}

            {customer && (
              <div className="mt-2.5 rounded-md2 bg-bg p-2.5 text-[12px] leading-relaxed text-ink-soft">
                <div className="text-[13px] font-bold text-ink">{customer.name}</div>
                {customer.shopName && <div className="font-semibold">{customer.shopName}</div>}
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

          {customer && (
            <CustomerFormDialog
              open={editCustomerOpen}
              onOpenChange={setEditCustomerOpen}
              mode="edit"
              customer={customer}
              onSaved={(c) => setCustomer({ ...c, phone: c.phone ?? null, guest: c.guest ?? false })}
            />
          )}

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
                    <ProductRow
                      key={p.id}
                      product={p}
                      boxQty={lines.find((l) => l.productId === p.id && l.unit === p.unit)?.qty ?? 0}
                      pieceQty={lines.find((l) => l.productId === p.id && l.unit === 'pc')?.qty ?? 0}
                      onAddBox={() => addProductVariant(p, 'unit')}
                      onDecrementBox={() => decrementProductVariant(p.id, p.unit)}
                      onAddPiece={() => addProductVariant(p, 'piece')}
                      onDecrementPiece={() => decrementProductVariant(p.id, 'pc')}
                    />
                  ))}
                  <div className="mt-2 border-t border-line px-2 pb-1 pt-2.5 text-[11px] text-ink-faint">All products (A–Z)</div>
                </>
              )}
              {filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-ink-faint">No active products found.</p>
              ) : (
                filteredProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    boxQty={lines.find((l) => l.productId === p.id && l.unit === p.unit)?.qty ?? 0}
                    pieceQty={lines.find((l) => l.productId === p.id && l.unit === 'pc')?.qty ?? 0}
                    onAddBox={() => addProductVariant(p, 'unit')}
                    onDecrementBox={() => decrementProductVariant(p.id, p.unit)}
                    onAddPiece={() => addProductVariant(p, 'piece')}
                    onDecrementPiece={() => decrementProductVariant(p.id, 'pc')}
                  />
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
          {isClassic && <InvoiceCompletenessChecklist items={checklistItems} />}
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
            <b className="font-mono">{lines.length}</b> product{lines.length !== 1 ? 's' : ''} · <b className="font-mono">{Math.round(totalUnits * 100) / 100}</b> unit
            {totalUnits !== 1 ? 's' : ''} &nbsp;·&nbsp; <b className="font-mono">{fmtInr(totals.total)}</b>
          </span>
          <button onClick={() => setPreviewOpen(true)} className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-[11.5px] font-extrabold text-white">
            <ArrowRight size={12} /> View
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{error}</p>}

      <div data-tour="save-buttons" className="mt-3.5 flex flex-wrap justify-end gap-2.5">
        <Button variant="outline" onClick={() => save('draft')} disabled={saving}>
          <FileText size={13} /> Save as draft
        </Button>
        <Button variant="secondary" onClick={() => save('paid')} disabled={saving}>
          <IndianRupee size={13} /> {saving ? 'Saving…' : 'Save & mark as paid'}
        </Button>
        <Button onClick={() => save('sent')} disabled={saving}>
          <CheckCircle2 size={13} /> {saving ? 'Saving…' : 'Save & mark as sent'}
        </Button>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink-faint">
        <AlertTriangle size={11} /> The invoice number is assigned the moment you save — nothing here is final until then.
      </p>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[720px]" mobileFullScreen>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} className="text-brand" /> Invoice preview
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto" style={PAPER_STYLE}>
            {isClassic ? (
              <InvoiceSheetClassic company={company} customer={customer} date={date} lines={lines} totals={totals} discountType={discountType} discountValue={discountValue} editable={false} />
            ) : (
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
            )}
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
        {isClassic ? (
          <InvoiceSheetClassic company={company} customer={customer} date={date} lines={lines} totals={totals} discountType={discountType} discountValue={discountValue} editable={false} />
        ) : (
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
        )}
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

function ProductRow({
  product,
  boxQty,
  pieceQty,
  onAddBox,
  onDecrementBox,
  onAddPiece,
  onDecrementPiece,
}: {
  product: Product;
  boxQty: number;
  pieceQty: number;
  onAddBox: () => void;
  onDecrementBox: () => void;
  onAddPiece: () => void;
  onDecrementPiece: () => void;
}) {
  const hasPack = !!product.packQty && Number(product.packQty) > 0;
  const perPieceRate = hasPack ? Number(product.price) / Number(product.packQty) : null;
  const active = boxQty > 0 || pieceQty > 0;
  return (
    <div className={`rounded-lg2 px-2.5 py-2.5 transition-colors hover:bg-bg ${active ? 'bg-brand-light' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${categoryTile(product.category)}`}>
          <CategoryIcon category={product.category} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold text-ink">{product.name}</div>
          <div className="text-[11px] text-ink-faint">
            {fmtInr(Number(product.price))} / {product.unit}
            {perPieceRate ? ` · ${fmtInr(perPieceRate)}/pc` : ''}
          </div>
        </div>
        {/* Simple products (no known pack size) keep one compact counter here.
            A product sold with a known pack size gets the fuller two-up
            layout below instead, so "as box" vs "as piece" never has to be
            inferred from a cramped pair of stacked pills. */}
        {!hasPack && <QtyCounter unitLabel={product.unit} qty={boxQty} onAdd={onAddBox} onDecrement={onDecrementBox} name={product.name} />}
      </div>
      {hasPack && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-2.5">
          <UnitCounterBlock caption="As box" unitLabel={product.unit} qty={boxQty} onAdd={onAddBox} onDecrement={onDecrementBox} name={product.name} />
          <UnitCounterBlock caption="As piece" unitLabel="pc" qty={pieceQty} onAdd={onAddPiece} onDecrement={onDecrementPiece} name={`${product.name} (loose pc)`} />
        </div>
      )}
    </div>
  );
}

/** Compact right-aligned +/- pill, used inline for products with no pack
 * size to convert to (nothing to choose between). */
function QtyCounter({ unitLabel, qty, onAdd, onDecrement, name }: { unitLabel: string; qty: number; onAdd: () => void; onDecrement: () => void; name: string }) {
  if (qty > 0) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-brand bg-surface p-0.5">
        <button onClick={onDecrement} aria-label={`Decrease ${name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
          <Minus size={11} />
        </button>
        <span key={qty} className="min-w-[20px] animate-bump text-center font-mono text-[12px] font-extrabold">
          {qty}
        </span>
        <button onClick={onAdd} aria-label={`Increase ${name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
          <Plus size={11} />
        </button>
      </div>
    );
  }
  return (
    <button onClick={onAdd} className="flex flex-shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-[11.5px] font-extrabold text-white">
      <Plus size={12} /> Add
    </button>
  );
}

/** Full-width labeled counter — one of the two "As box" / "As piece" blocks
 * shown for a product with a known pack size. Deliberately roomier and
 * captioned (rather than two small stacked pills) so it's unambiguous which
 * unit each control adds, both while empty and once a line exists. */
function UnitCounterBlock({ caption, unitLabel, qty, onAdd, onDecrement, name }: { caption: string; unitLabel: string; qty: number; onAdd: () => void; onDecrement: () => void; name: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg2 bg-bg py-2">
      <span className="text-[9px] font-bold uppercase tracking-wide text-ink-faint">{caption}</span>
      {qty > 0 ? (
        <div className="flex items-center gap-1.5 rounded-full border-[1.5px] border-brand bg-surface p-0.5">
          <button onClick={onDecrement} aria-label={`Decrease ${name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <Minus size={11} />
          </button>
          <span key={qty} className="min-w-[38px] animate-bump text-center font-mono text-[12px] font-extrabold">
            {qty} {unitLabel}
          </span>
          <button onClick={onAdd} aria-label={`Increase ${name} quantity`} className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-light text-brand-dark">
            <Plus size={11} />
          </button>
        </div>
      ) : (
        <button onClick={onAdd} className="flex items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-[11px] font-extrabold text-white">
          <Plus size={11} /> {unitLabel}
        </button>
      )}
    </div>
  );
}

function AddCustomItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { name: string; unit: string; qty: number; rate: number; productId?: string; packQty?: number | null }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pc');
  const [qty, setQty] = useState('1');
  const [rate, setRate] = useState('');
  // Optional — only meaningful if this gets saved as a catalog product
  // (below): a known pack size lets the builder later offer it as two
  // independent lines (e.g. "4 Box" and "30 pc"), same as any other
  // catalog product — see addProductVariant. Not used to blend a
  // fractional quantity into this one line any more.
  const [packQty, setPackQty] = useState('');
  const [saveAsProduct, setSaveAsProduct] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const createProduct = useCreateProduct();

  const packQtyNum = parseInt(packQty, 10) || 0;

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
      if (packQtyNum > 0) formData.set('packQty', String(packQtyNum));
      const result = await createProduct.mutateAsync(formData);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      productId = result.id;
      toast.success('Added to your catalog too');
    }

    onAdd({ name: name.trim(), unit: unit.trim() || 'pc', qty: qtyNum, rate: rateNum, productId, packQty: packQtyNum > 0 ? packQtyNum : undefined });
    setName('');
    setUnit('pc');
    setQty('1');
    setRate('');
    setPackQty('');
    setSaveAsProduct(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg2 border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pc, kg, box…" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Qty" name="qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} mono />
        <Field label="Rate (₹)" name="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} mono />
      </div>
      <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
        <input type="checkbox" checked={saveAsProduct} onChange={(e) => setSaveAsProduct(e.target.checked)} className="h-3.5 w-3.5 rounded-sm2 border-line accent-brand" />
        Save this as a product for next time
      </label>
      {saveAsProduct && unit.trim().toLowerCase() !== 'pc' && (
        <Field label="Pieces per unit (optional — lets you also bill this product loose, by the piece, later)" name="packQty" type="number" value={packQty} onChange={(e) => setPackQty(e.target.value)} mono />
      )}
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
      shopName: String(formData.get('shopName') || ''),
      phone: String(formData.get('phone') || ''),
      altPhone: String(formData.get('altPhone') || ''),
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
        <Field label="Shop name (optional)" name="shopName" />
        <Field label="Mobile" name="phone" defaultValue={looksLikePhone ? query : ''} />
        <Field label="Alternative phone (optional)" name="altPhone" />
        <div className="col-span-2">
          <Field label="GSTIN (optional)" name="gstin" mono />
        </div>
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
