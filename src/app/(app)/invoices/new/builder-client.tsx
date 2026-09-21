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
  Info,
  Settings,
  Lock,
  Percent,
  QrCode,
  Building2,
  RotateCcw,
  Check,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { searchCustomersForBilling, getCustomerLedger } from '@/actions/customers';
import { createInvoice, updateInvoice } from '@/actions/invoices';
import { updateCompanyGstDefaults } from '@/actions/company';
import { frequentProductIdsForCustomer } from '@/actions/products';
import { useCreateCustomer } from '@/hooks/use-customers';
import { useCreateProduct } from '@/hooks/use-products';
import { computeTotals, fmtInr, formatUnit, type LineInput } from '@/lib/gst';
import { upiQrDataUrl } from '@/lib/qr';
import { numberToWords } from '@/lib/number-to-words';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetFooter, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { StateSelect } from '@/components/ui/location-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceCompletenessChecklist } from '@/components/invoices/invoice-completeness-checklist';
import { ResponsiveSheetScale } from '@/components/invoices/responsive-sheet-scale';
import { hashColor, initials } from '@/lib/avatar';
import { customerDisplayName } from '@/lib/customer';
import { UNITS } from '@/lib/units';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { StatusBadge } from '@/components/ui/status-badge';

type PriceTier = { id?: string; unit: string; price: string | number; approxQty: string | number | null };
type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  price: string | number;
  packQty?: number | null;
  hsn?: string | null;
  altUnit?: string | null;
  altQtyPerUnit?: string | number | null;
  priceTiers?: PriceTier[];
};

/** Every pricing option for a product, oldest-field-compatible: falls back
 * to a single synthetic tier built from unit/price/packQty if a product
 * somehow has none (shouldn't happen once the backfill migration has run,
 * but keeps this screen working regardless). */
function tiersFor(p: Product): PriceTier[] {
  if (p.priceTiers && p.priceTiers.length > 0) return p.priceTiers;
  return [{ unit: p.unit, price: p.price, approxQty: p.packQty ?? null }];
}
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
  showUpiQr: boolean;
  showGpayNumber: boolean;
  terms: string | null;
  cgstRate: string | number;
  sgstRate: string | number;
  igstRate: string | number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  pdfShowBankDetails: boolean;
  pdfShowHsnSummary: boolean;
  defaultHsn: string;
  invoiceTemplate: 'MODERN' | 'CLASSIC';
  fssaiNo?: string | null;
  pincode?: string | null;
  pan?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
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

// Pre-fill shape for editing an existing invoice in place, any time up to
// (not including) PAID (see src/app/(app)/invoices/new/page.tsx's
// `?edit=<id>` handling) — everything the builder needs to resume it as if
// it were being built for the first time, plus the id/number/status so
// save() knows to update rather than create and the header badge reflects
// the invoice's real current state rather than always saying "Draft".
type EditInvoice = {
  id: string;
  number: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID';
  customer: Customer;
  date: string;
  due: string;
  overallDiscountType: 'PERCENT' | 'FLAT';
  overallDiscountValue: number;
  notes: string;
  deliveryInstructions: string;
  showTransportDetails: boolean;
  transportVehicleNo: string;
  transportDriverName: string;
  transportDriverPhone: string;
  lines: Line[];
  // The invoice's own frozen NIC e-Invoice IRN, if one has been filed — once
  // set, GST settings are locked (see the Settings sheet below) since NIC
  // has no amend API for a filed e-Invoice's tax amounts.
  irn?: string | null;
  // The invoice's own frozen GST snapshot — see schema.prisma's
  // Invoice.cgstRate comment for why this is never re-derived from Company.
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstEnabled: boolean;
  sgstEnabled: boolean;
  igstEnabled: boolean;
  showBankDetails: boolean;
  showHsnSummary: boolean;
  showUpiQr: boolean;
  showGpayNumber: boolean;
};

function categoryTile(cat: string) {
  return CATEGORY_TILE[cat] ?? 'bg-surface-alt text-ink-soft';
}
function CategoryIcon({ category, size = 15 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Package;
  return <Icon size={size} />;
}

export function BuilderClient({ products, company, editInvoice }: { products: Product[]; company: Company; editInvoice?: EditInvoice | null }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(editInvoice?.customer ?? null);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState<Customer[]>([]);
  const [custLoading, setCustLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [lines, setLines] = useState<Line[]>(editInvoice?.lines ?? []);
  const [productQuery, setProductQuery] = useState('');
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FLAT'>(editInvoice?.overallDiscountType ?? 'PERCENT');
  const [discountValue, setDiscountValue] = useState(editInvoice?.overallDiscountValue ?? 0);
  // When true, the % typed above broadcasts to every line's own `discount`
  // field (so it prints per-item) instead of being one reduction applied
  // once at invoice level — the two are mutually exclusive: computeTotals
  // below is fed a zeroed-out overall discount whenever this is on, since
  // the reduction is already fully baked into each line's own subtotal.
  const [applyDiscountPerItem, setApplyDiscountPerItem] = useState(false);
  const [notes, setNotes] = useState(editInvoice?.notes ?? '');
  const [deliveryInstructions, setDeliveryInstructions] = useState(editInvoice?.deliveryInstructions ?? '');
  const [showTransportDetails, setShowTransportDetails] = useState(editInvoice?.showTransportDetails ?? false);
  const [transportVehicleNo, setTransportVehicleNo] = useState(editInvoice?.transportVehicleNo ?? '');
  const [transportDriverName, setTransportDriverName] = useState(editInvoice?.transportDriverName ?? '');
  const [transportDriverPhone, setTransportDriverPhone] = useState(editInvoice?.transportDriverPhone ?? '');
  const [date, setDate] = useState(() => editInvoice?.date ?? new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState(() => editInvoice?.due ?? new Date().toISOString().slice(0, 10));
  const [saving, startSaving] = useTransition();
  // The id of the DRAFT row backing "Download / print" (see downloadPdf
  // below) — starts as editInvoice's own id when editing an existing draft,
  // stays null for a brand-new invoice until the first PDF download claims
  // one. Kept distinct from actually clicking Save: the user can preview a
  // PDF repeatedly while still editing without that creating a fresh draft
  // (and a fresh invoice number) on every click — only the first click
  // claims one; every click after that updates the same row in place.
  const [draftInvoiceId, setDraftInvoiceId] = useState<string | null>(editInvoice?.id ?? null);
  const [downloadingPdf, startDownloadingPdf] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [outstandingElsewhere, setOutstandingElsewhere] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Per-invoice GST/section-visibility override — pre-filled from the
  // invoice's own already-stored snapshot when editing (never silently
  // reset to Company's current live values just because something else is
  // being edited), or from Company's current defaults when creating new.
  // See schema.prisma's Invoice.cgstRate comment for the bug this fixes.
  const [gstSettings, setGstSettings] = useState(() => ({
    cgstRate: editInvoice ? editInvoice.cgstRate : Number(company.cgstRate),
    sgstRate: editInvoice ? editInvoice.sgstRate : Number(company.sgstRate),
    igstRate: editInvoice ? editInvoice.igstRate : Number(company.igstRate),
    cgstEnabled: editInvoice ? editInvoice.cgstEnabled : company.cgstEnabled,
    sgstEnabled: editInvoice ? editInvoice.sgstEnabled : company.sgstEnabled,
    igstEnabled: editInvoice ? editInvoice.igstEnabled : company.igstEnabled,
    showBankDetails: editInvoice ? editInvoice.showBankDetails : company.pdfShowBankDetails,
    showHsnSummary: editInvoice ? editInvoice.showHsnSummary : company.pdfShowHsnSummary,
    showUpiQr: editInvoice ? editInvoice.showUpiQr : company.showUpiQr,
    showGpayNumber: editInvoice ? editInvoice.showGpayNumber : company.showGpayNumber,
  }));
  // Once an e-Invoice IRN is filed, its tax amounts are locked with NIC (no
  // amend API, only cancel-within-24h) — the settings sheet goes read-only
  // so a later edit here can't desync from what was actually filed. The
  // server enforces this independently too (updateInvoice ignores GST-field
  // changes once existing.irn is set), this is just the matching UI state.
  const gstLocked = !!editInvoice?.irn;
  // The Settings sheet edits this draft, not `gstSettings` itself — nothing
  // takes effect (the live preview, the save payload) until "Apply" commits
  // it. Re-synced from `gstSettings` every time the sheet opens, so it
  // always starts from whatever's currently applied, not last time's
  // abandoned edits.
  const [draftSettings, setDraftSettings] = useState(gstSettings);
  useEffect(() => {
    if (settingsOpen) setDraftSettings(gstSettings);
  }, [settingsOpen, gstSettings]);
  // What "Reset to company defaults" resets the draft to — starts as
  // Company's own current values, and is kept in sync locally after a
  // successful "Save as company default" (see below) so Reset immediately
  // reflects it without needing a full page reload.
  const [companyDefaults, setCompanyDefaults] = useState({
    cgstRate: Number(company.cgstRate),
    sgstRate: Number(company.sgstRate),
    igstRate: Number(company.igstRate),
    cgstEnabled: company.cgstEnabled,
    sgstEnabled: company.sgstEnabled,
    igstEnabled: company.igstEnabled,
    showBankDetails: company.pdfShowBankDetails,
    showHsnSummary: company.pdfShowHsnSummary,
    showUpiQr: company.showUpiQr,
    showGpayNumber: company.showGpayNumber,
  });
  const [savingToCompany, startSavingToCompany] = useTransition();
  const hydratedDraftRef = useRef(false);

  // Live-preview-only UPI QR — the `qrcode` package's toDataURL runs fine in
  // the browser too, so the preview can show the real thing instead of a
  // placeholder. The saved/PDF path generates its own copy server-side
  // (src/app/(app)/invoices/[id]/page.tsx) rather than trusting this value.
  const [upiQrPreview, setUpiQrPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!gstSettings.showUpiQr || !company.upi) {
      setUpiQrPreview(null);
      return;
    }
    let cancelled = false;
    upiQrDataUrl(company.upi, company.name).then((url) => {
      if (!cancelled) setUpiQrPreview(url);
    });
    return () => {
      cancelled = true;
    };
  }, [gstSettings.showUpiQr, company.upi, company.name]);

  // Live-preview-only GPay number, mirroring the QR preview above — plain
  // string, no async encoding needed.
  const gpayNumberPreview = gstSettings.showGpayNumber ? company.phone || company.altPhone || null : null;

  // Restore an unsaved draft left over from a refresh/accidental close, once
  // — never when editing an existing DRAFT invoice, since that's already
  // hydrated from the server and this localStorage draft is for an unrelated
  // "new invoice" attempt (overwriting it here would lose that instead).
  useEffect(() => {
    if (editInvoice) {
      hydratedDraftRef.current = true;
      return;
    }
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
          if (typeof draft.notes === 'string') setNotes(draft.notes);
          if (typeof draft.deliveryInstructions === 'string') setDeliveryInstructions(draft.deliveryInstructions);
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
    if (!hydratedDraftRef.current || editInvoice) return;
    try {
      if (!customer && lines.length === 0) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ customer, lines, discountType, discountValue, date, due, notes, deliveryInstructions }));
      }
    } catch {
      // best-effort only
    }
  }, [customer, lines, discountType, discountValue, date, due, notes, deliveryInstructions]);

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

  // Real pagination (not an infinite scroll list) for the catalog picker —
  // resets to page 1 whenever the search narrows/widens the result set.
  // 20 rather than the old 6: this panel has no fixed/scroll-clamped height
  // of its own (the whole builder page scrolls together), so a low count
  // just meant more clicks through pagination pages for a normal-sized
  // catalog instead of actually using the available page height.
  const PRODUCTS_PER_PAGE = 20;
  const [productPage, setProductPage] = useState(1);
  useEffect(() => setProductPage(1), [productQuery]);
  const pagedProducts = useMemo(
    () => filteredProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE),
    [filteredProducts, productPage]
  );

  const totals = useMemo(() => {
    const lineInputs: LineInput[] = lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount }));
    return computeTotals(
      lineInputs,
      // Per-item mode's reduction is already inside each line's own qty*rate
      // math (see lineInputs above) — feeding the same % in here too would
      // double-discount, so the "overall" side is forced to zero instead.
      applyDiscountPerItem ? { type: 'PERCENT', value: 0 } : { type: discountType, value: discountValue },
      {
        cgstRate: gstSettings.cgstRate,
        sgstRate: gstSettings.sgstRate,
        igstRate: gstSettings.igstRate,
        cgstEnabled: gstSettings.cgstEnabled,
        sgstEnabled: gstSettings.sgstEnabled,
        igstEnabled: gstSettings.igstEnabled,
      },
      company.state,
      customer?.state ?? company.state
    );
  }, [lines, discountType, discountValue, applyDiscountPerItem, company.state, customer, gstSettings]);

  // Everywhere the live preview reads GST config or section-visibility, it
  // reads this (the current override) instead of raw `company` — a single
  // derived object so every InvoiceSheet/InvoiceSheetClassic render call
  // site stays in sync with the Settings sheet without threading 8 separate
  // props through each one.
  const previewCompany = useMemo(
    () => ({
      ...company,
      cgstRate: gstSettings.cgstRate,
      sgstRate: gstSettings.sgstRate,
      igstRate: gstSettings.igstRate,
      cgstEnabled: gstSettings.cgstEnabled,
      sgstEnabled: gstSettings.sgstEnabled,
      igstEnabled: gstSettings.igstEnabled,
      pdfShowBankDetails: gstSettings.showBankDetails,
      pdfShowHsnSummary: gstSettings.showHsnSummary,
    }),
    [company, gstSettings]
  );

  const lineDiscountTotal = lines.reduce((s, l) => s + l.qty * l.rate * (l.discount / 100), 0);
  const totalSavings = lineDiscountTotal + totals.overallDiscountAmount;
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);

  // A product can have multiple pricing tiers (e.g. "Box" at one price and a
  // loose "Piece" at a plain price) — each becomes an independent line item,
  // keyed by (productId, unit) so a box-line and a piece-line for the same
  // product never collide and increment independently. See ProductPriceTier
  // (prisma/schema.prisma). A tier's approxQty (e.g. "1 Box ≈ 40 Piece") is
  // purely informational — never a purchase minimum — so every tier always
  // starts at qty 1 here, regardless of approxQty.
  function addProductTier(p: Product, tier: PriceTier) {
    const unit = tier.unit;
    const rate = Number(tier.price);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id && l.unit === unit);
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      const isPrimary = unit === p.unit;
      toast.success(`${p.name} added${isPrimary ? '' : ` (${formatUnit(unit)})`}`);
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
          packQty: isPrimary ? p.packQty : null,
          hsn: p.hsn || company.defaultHsn,
          altUnit: isPrimary ? p.altUnit : null,
          altQtyPerUnit: isPrimary && p.altQtyPerUnit ? Number(p.altQtyPerUnit) : null,
        },
      ];
    });
  }
  function decrementProductTier(productId: string, unit: string) {
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
      {
        lineId: crypto.randomUUID(),
        productId: data.productId ?? null,
        name: data.name,
        unit: data.unit,
        qty: data.qty,
        rate: data.rate,
        discount: 0,
        packQty: data.packQty ?? null,
        hsn: company.defaultHsn,
      },
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
  function changeDiscountValue(v: number) {
    setDiscountValue(v);
    // Per-item mode: the box's number IS every line's discount — keep them
    // in lockstep on every keystroke instead of a separate "apply" step.
    if (applyDiscountPerItem) setLines((prev) => prev.map((l) => ({ ...l, discount: v })));
  }
  function toggleApplyDiscountPerItem(checked: boolean) {
    setApplyDiscountPerItem(checked);
    if (checked) {
      // Per-line discounts are percent-only — switch the box to match, and
      // broadcast its current value to every line right away.
      setDiscountType('PERCENT');
      setLines((prev) => prev.map((l) => ({ ...l, discount: discountValue })));
    } else {
      // Back to a single overall reduction — clear what was broadcast so
      // the two modes never silently combine into a double discount.
      setLines((prev) => prev.map((l) => ({ ...l, discount: 0 })));
    }
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
      const payload = {
        customerId: customer.id,
        date,
        due,
        items: lines,
        // Per-item mode already baked its % into every line's own discount
        // (see toggleApplyDiscountPerItem/changeDiscountValue above) — the
        // overall figure must persist as inert (0) or the server would
        // recompute the same reduction a second time on top of that.
        overallDiscountType: applyDiscountPerItem ? 'PERCENT' : discountType,
        overallDiscountValue: applyDiscountPerItem ? 0 : discountValue,
        notes,
        deliveryInstructions,
        showTransportDetails,
        transportVehicleNo,
        transportDriverName,
        transportDriverPhone,
        markSent: mode !== 'draft',
        markPaid: mode === 'paid',
        ...gstSettings,
      };
      const result = editInvoice ? await updateInvoice(editInvoice.id, payload) : await createInvoice(payload);
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

  /** Generates a real, server-rendered A4 PDF of the current draft and opens
   * it in a new tab — the same headless Playwright route the invoice detail
   * page's PrintButton already uses, instead of `window.print()`. That
   * matters because `window.print()` hands control to the *browser's own*
   * print dialog, which (depending on the user's "Headers and footers"
   * checkbox) stamps its own page URL/number chrome over every page and
   * positions its own footer — neither of which this app's CSS can reach or
   * override, since it isn't part of the printed document at all. The real
   * PDF route has no such dialog in the loop: it's Playwright printing
   * headlessly with our own custom footer template, so what comes out is
   * pixel-identical to the invoice detail page's PDF.
   *
   * This does need somewhere to render *from* — Playwright navigates to a
   * real page and needs a real invoice id, so the first click here saves
   * the current form as a DRAFT (exactly what "Save as draft" already does)
   * and remembers its id; every click after that updates the same draft
   * row in place via `draftInvoiceId` rather than creating another one. */
  function downloadPdf() {
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
    // Opened synchronously, right here inside the click handler — a tab
    // opened *after* the `await` below would no longer read as caused by
    // the user's click to the browser's popup blocker, and get silently
    // swallowed (an about:blank tab that never navigates, no error either).
    // Pointing this blank tab at the real URL once the save resolves avoids
    // that entirely.
    const pdfWindow = window.open('', '_blank');
    startDownloadingPdf(async () => {
      const payload = {
        customerId: customer.id,
        date,
        due,
        items: lines,
        overallDiscountType: applyDiscountPerItem ? ('PERCENT' as const) : discountType,
        overallDiscountValue: applyDiscountPerItem ? 0 : discountValue,
        notes,
        deliveryInstructions,
        showTransportDetails,
        transportVehicleNo,
        transportDriverName,
        transportDriverPhone,
        markSent: false,
        markPaid: false,
        ...gstSettings,
      };
      const result = draftInvoiceId ? await updateInvoice(draftInvoiceId, payload) : await createInvoice(payload);
      if (result.error) {
        toast.error(result.error);
        pdfWindow?.close();
        return;
      }
      const id = draftInvoiceId ?? result.invoiceId;
      if (id) {
        setDraftInvoiceId(id);
        if (pdfWindow) pdfWindow.location.href = `/api/invoices/${id}/pdf?inline=1`;
      }
    });
  }

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
          { label: `${customerDisplayName(customer)}'s GSTIN`, done: !!customer.gstin, href: '/customers' },
          { label: `${customerDisplayName(customer)}'s contact / phone`, done: !!(customer.contact || customer.phone), href: '/customers' },
        ]
      : []),
    ...(lines.length > 0 ? [{ label: 'HSN/SAC code on every line item', done: lines.every((l) => !!l.hsn) }] : []),
  ];

  const sheet = isClassic ? (
    <InvoiceSheetClassic
      company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
      customer={customer}
      date={date}
      lines={lines}
      totals={totals}
      discountType={discountType}
      discountValue={discountValue}
      applyPerItem={applyDiscountPerItem}
      notes={notes}
      deliveryInstructions={deliveryInstructions}
      showTransportDetails={showTransportDetails}
      transportVehicleNo={transportVehicleNo}
      transportDriverName={transportDriverName}
      transportDriverPhone={transportDriverPhone}
      editable
      onDiscountTypeChange={setDiscountType}
      onDiscountValueChange={changeDiscountValue}
      onApplyPerItemChange={toggleApplyDiscountPerItem}
      onIncrement={incrementLineQty}
      onDecrement={decrementLineQty}
      onUpdateLine={updateLine}
      onRemoveLine={removeLine}
      onNotesChange={setNotes}
      onDeliveryInstructionsChange={setDeliveryInstructions}
      onTransportVehicleNoChange={setTransportVehicleNo}
      onTransportDriverNameChange={setTransportDriverName}
      onTransportDriverPhoneChange={setTransportDriverPhone}
    />
  ) : (
    <InvoiceSheet
      company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
      customer={customer}
      date={date}
      due={due}
      lines={lines}
      totals={totals}
      totalSavings={totalSavings}
      discountType={discountType}
      discountValue={discountValue}
      applyPerItem={applyDiscountPerItem}
      editable
      onDiscountTypeChange={setDiscountType}
      onDiscountValueChange={changeDiscountValue}
      onApplyPerItemChange={toggleApplyDiscountPerItem}
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
          print-only sheet is a sibling further down.
          `invoice-builder-root` opts this page out of the shared app
          shell's max-w-[1220px] centering (see globals.css) — the builder
          needs the full content width so the left panel can stay narrow
          while the invoice sheet gets real room, unlike every other page
          under (app)/layout.tsx which keeps the centered constraint. */}
      <div className="invoice-builder-root print:hidden">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(editInvoice ? `/invoices/${editInvoice.id}` : '/invoices')}>
            <ArrowLeft size={13} /> Back
          </Button>
          <span className="font-mono text-[13px] font-semibold text-ink-soft">{editInvoice ? `Editing ${editInvoice.number}` : 'New invoice'}</span>
          {editInvoice ? <StatusBadge status={editInvoice.status} /> : <span className="rounded-sm2 bg-surface-alt px-2.5 py-1 text-[11px] font-bold text-ink-soft">Draft</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-sm2 border border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-soft">
            <Clock size={12} /> Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none" />
          </div>
          <div className="flex items-center gap-1.5 rounded-sm2 border border-line bg-surface px-3 py-1.5 text-[11.5px] text-ink-soft">
            <Clock size={12} /> Due
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 pb-24 lg:grid-cols-[40fr_60fr] lg:pb-4">
        {/* LEFT 40% — every action/input control, kept as compact as
            possible so the right column (the live, real-time PDF preview —
            re-renders on every state change, no separate "preview" step)
            gets the most room. */}
        <div className="flex flex-col gap-2.5">
          {isClassic && <InvoiceCompletenessChecklist items={checklistItems} compact />}
          <div data-tour="bill-to" className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
              <Users size={11} className="text-brand" /> Bill to
            </div>
            {customer ? (
              <div className="flex items-center gap-2 rounded-lg2 border border-line bg-bg px-2.5 py-2">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 text-[11px] font-extrabold text-white" style={{ background: hashColor(customerDisplayName(customer)) }}>
                  {initials(customerDisplayName(customer))}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-bold text-ink">
                    {customerDisplayName(customer)}
                    {customer.guest && <span className="ml-1.5 rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
                  </div>
                  <div className="truncate text-[10.5px] text-ink-faint">
                    {customer.shopName ? customer.name + ' · ' : ''}
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
                <div className="flex items-center gap-2 rounded-sm2 border border-line bg-surface px-2.5 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
                  <Search size={12} className="flex-shrink-0 text-ink-faint" />
                  <input
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    placeholder="Name or mobile number…"
                    autoComplete="off"
                    className="w-full bg-transparent text-[12px] outline-none"
                  />
                </div>
                <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg2 border border-line bg-surface shadow-elevated">
                  {custLoading ? (
                    <div className="space-y-1.5 p-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-1 py-1.5">
                          <Skeleton className="h-[26px] w-[26px] flex-shrink-0 rounded-sm2" />
                          <Skeleton className="h-3 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    custResults.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCustomer(c)}
                        className="flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left last:border-0 hover:bg-brand-light"
                      >
                        <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-sm2 text-[10.5px] font-extrabold text-white" style={{ background: hashColor(customerDisplayName(c)) }}>
                          {initials(customerDisplayName(c))}
                        </span>
                        <span className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold text-ink">{c.shopName || c.name}</div>
                          <div className="truncate text-[10.5px] text-ink-faint">{c.shopName ? `${c.name}${c.phone ? ` · ${c.phone}` : ''}` : c.phone || c.state}</div>
                        </span>
                      </button>
                    ))
                  )}
                  <button onClick={() => setShowQuickAdd(true)} className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-1.5 text-left text-[11.5px] font-bold text-brand hover:bg-brand-light">
                    <Plus size={12} /> Add &quot;{custQuery || 'someone new'}&quot; as a new customer
                  </button>
                </div>
              </div>
            )}

            {customer && (
              <div className="mt-1.5 rounded-md2 bg-bg p-2 text-[11px] leading-relaxed text-ink-soft">
                {customer.address && <div className="truncate">{customer.address}</div>}
                <div>
                  {customer.state} {customer.gstin ? `· GSTIN ${customer.gstin}` : '· unregistered'}
                </div>
                {(totals.useIgst ? gstSettings.igstEnabled : gstSettings.cgstEnabled || gstSettings.sgstEnabled) && (
                  <div className="mt-0.5 flex items-center gap-1.5 font-bold text-ink">
                    {totals.useIgst
                      ? `IGST ${gstSettings.igstRate}%`
                      : [gstSettings.cgstEnabled && `CGST ${gstSettings.cgstRate}%`, gstSettings.sgstEnabled && `SGST ${gstSettings.sgstRate}%`].filter(Boolean).join(' + ')}
                  </div>
                )}
                {overLimit ? (
                  <div className="mt-1 flex items-start gap-1.5 border-t border-dashed border-line pt-1 font-bold text-red">
                    <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> Puts them at {fmtInr(projectedBalance)} — over their {fmtInr(creditLimit)} credit limit
                  </div>
                ) : (
                  outstandingElsewhere > 0.004 && (
                    <div className="mt-1 flex items-start gap-1.5 border-t border-dashed border-line pt-1 font-bold text-gold">
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> Already owes {fmtInr(outstandingElsewhere)} from other invoices
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

          <div data-tour="add-products" className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
              <Package size={11} className="text-brand" /> Add products
            </div>
            <div className="flex items-center gap-2 rounded-sm2 border border-line bg-bg px-2.5 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
              <Search size={12} className="flex-shrink-0 text-ink-faint" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="Search catalog to add…"
                autoComplete="off"
                className="w-full bg-transparent text-[12px] outline-none"
              />
            </div>
            <div className="mt-1">
              {frequentProducts.length > 0 && (
                <>
                  <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-bold text-brand-dark">
                    <Sparkles size={10} className="mr-1 inline" /> Frequently ordered by this customer
                  </div>
                  {frequentProducts.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      lines={lines}
                      onAddTier={(tier) => addProductTier(p, tier)}
                      onDecrementTier={(unit) => decrementProductTier(p.id, unit)}
                    />
                  ))}
                  <div className="mt-1 border-t border-line px-1.5 pb-0.5 pt-1.5 text-[10px] text-ink-faint">All products (A–Z)</div>
                </>
              )}
              {pagedProducts.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-ink-faint">No active products found.</p>
              ) : (
                pagedProducts.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    lines={lines}
                    onAddTier={(tier) => addProductTier(p, tier)}
                    onDecrementTier={(unit) => decrementProductTier(p.id, unit)}
                  />
                ))
              )}
            </div>
            {filteredProducts.length > PRODUCTS_PER_PAGE && (
              <Pagination page={productPage} pageSize={PRODUCTS_PER_PAGE} total={filteredProducts.length} onPageChange={setProductPage} className="border-t-0 px-0 py-1.5" />
            )}
            <div data-tour="custom-item">
              {showCustomItemForm ? (
                <AddCustomItemForm
                  onAdd={addCustomLine}
                  onCancel={() => setShowCustomItemForm(false)}
                />
              ) : (
                <button
                  onClick={() => setShowCustomItemForm(true)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg2 border border-dashed border-line py-1.5 text-[11px] font-bold text-ink-faint hover:border-brand hover:text-brand"
                >
                  <Tag size={11} /> Bill something not in your catalog
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 60% — the live, real-time PDF view only, nothing else. */}
        <div data-tour="invoice-sheet" className="relative" style={PAPER_STYLE}>
          <div className="h-[5px] rounded-t-lg2 bg-brand" />
          <ResponsiveSheetScale>{sheet}</ResponsiveSheetScale>
        </div>
      </div>

      {/* One consolidated footer bar, pinned to the bottom of the viewport
          (above the mobile BottomNav, flush with it on desktop where
          that's hidden) — breaks out of main's own side padding (see
          (app)/layout.tsx) via matching negative margins so it spans the
          whole content width edge-to-edge, regardless of which column the
          click that triggered it came from. Replaces two previously
          separate stacked bars (a cart-summary strip and a save-actions
          bar) with a single row: running total on the left, every action
          (Preview, Download, the three Save variants) on the right. */}
      <div
        data-tour="save-buttons"
        className="sticky bottom-0 z-20 -mx-4 mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-line bg-surface px-4 py-3 shadow-elevated md:-mx-6 md:px-6"
      >
        <div className="mr-auto flex min-w-0 flex-1 items-center">
          {error ? (
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-destructive">
              <AlertTriangle size={12} className="flex-shrink-0" /> {error}
            </p>
          ) : hasItems ? (
            <div className="flex items-center gap-2 text-[12px] font-semibold leading-tight text-ink-soft">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
                <ShoppingCart size={13} />
              </span>
              <span>
                <b className="font-mono text-ink">{lines.length}</b> product{lines.length !== 1 ? 's' : ''} · <b className="font-mono text-ink">{Math.round(totalUnits * 100) / 100}</b> unit
                {totalUnits !== 1 ? 's' : ''} &nbsp;·&nbsp; <b className="font-mono text-ink">{fmtInr(totals.total)}</b>
              </span>
            </div>
          ) : (
            <p className="hidden items-center gap-1.5 text-[10.5px] text-ink-faint sm:flex">
              <Info size={11} className="flex-shrink-0" /> The invoice number is assigned the moment you save.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button data-tour="preview-btn" variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye size={13} /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={downloadingPdf}>
            <Printer size={13} /> {downloadingPdf ? 'Generating…' : 'Download PDF'}
          </Button>
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
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[720px]" mobileFullScreen>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} className="text-brand" /> Invoice preview
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto invoice-sheet-mono" style={PAPER_STYLE}>
            <ResponsiveSheetScale>
              {isClassic ? (
                <InvoiceSheetClassic
                  company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
                  customer={customer}
                  date={date}
                  lines={lines}
                  totals={totals}
                  discountType={discountType}
                  discountValue={discountValue}
                  notes={notes}
                  deliveryInstructions={deliveryInstructions}
                  showTransportDetails={showTransportDetails}
                  transportVehicleNo={transportVehicleNo}
                  transportDriverName={transportDriverName}
                  transportDriverPhone={transportDriverPhone}
                  editable={false}
                />
              ) : (
                <InvoiceSheet
                  company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
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
            </ResponsiveSheetScale>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreviewOpen(false)}>
              <Pencil size={12} /> Back to edit
            </Button>
            <Button variant="secondary" onClick={() => setShareOpen(true)} disabled={!customer}>
              <Share2 size={13} /> Share
            </Button>
            <Button onClick={downloadPdf} disabled={downloadingPdf}>
              <Printer size={13} /> {downloadingPdf ? 'Generating…' : 'Download / print'}
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

      {/* Fixed above both sticky bottom bars (the cart summary and the save
          bar) so it never gets covered on mobile, where the two of them
          stack up to ~190px tall together. */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label="Invoice settings"
        className="fixed bottom-56 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-chrome text-white shadow-elevated transition-transform hover:scale-105 md:bottom-28 md:right-6"
      >
        {gstLocked ? <Lock size={18} /> : <Settings size={18} />}
      </button>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetIcon>
              <Settings size={16} />
            </SheetIcon>
            <div>
              <SheetTitle>Invoice settings</SheetTitle>
              <SheetDescription>Override company defaults just for this invoice — nothing here takes effect until you hit Apply.</SheetDescription>
            </div>
          </SheetHeader>
          <SheetBody className="space-y-4">
            {gstLocked && (
              <div className="flex items-start gap-2 rounded-lg2 border border-line bg-bg p-3 text-[11.5px] font-semibold text-ink-soft">
                <Lock size={13} className="mt-0.5 flex-shrink-0 text-ink-faint" />
                GST settings are locked — this invoice has a filed e-Invoice (IRN). Cancel the e-Invoice first if these need to change.
              </div>
            )}

            <SettingsSection icon={Percent} title="GST">
              <SettingsRateRow
                label="CGST"
                rate={draftSettings.cgstRate}
                enabled={draftSettings.cgstEnabled}
                disabled={gstLocked}
                onRateChange={(v) => setDraftSettings((s) => ({ ...s, cgstRate: v }))}
                onEnabledChange={(v) => setDraftSettings((s) => ({ ...s, cgstEnabled: v }))}
              />
              <SettingsRateRow
                label="SGST"
                rate={draftSettings.sgstRate}
                enabled={draftSettings.sgstEnabled}
                disabled={gstLocked}
                onRateChange={(v) => setDraftSettings((s) => ({ ...s, sgstRate: v }))}
                onEnabledChange={(v) => setDraftSettings((s) => ({ ...s, sgstEnabled: v }))}
              />
              <SettingsRateRow
                label="IGST"
                rate={draftSettings.igstRate}
                enabled={draftSettings.igstEnabled}
                disabled={gstLocked}
                onRateChange={(v) => setDraftSettings((s) => ({ ...s, igstRate: v }))}
                onEnabledChange={(v) => setDraftSettings((s) => ({ ...s, igstEnabled: v }))}
              />
            </SettingsSection>

            <SettingsSection icon={FileText} title="PDF sections">
              <SettingsToggleRow
                label="Bank details"
                checked={draftSettings.showBankDetails}
                disabled={gstLocked}
                onChange={(v) => setDraftSettings((s) => ({ ...s, showBankDetails: v }))}
              />
              {isClassic && (
                <SettingsToggleRow
                  label="HSN-wise tax summary"
                  checked={draftSettings.showHsnSummary}
                  disabled={gstLocked}
                  onChange={(v) => setDraftSettings((s) => ({ ...s, showHsnSummary: v }))}
                />
              )}
            </SettingsSection>

            <SettingsSection icon={QrCode} title="Payment info">
              <SettingsToggleRow label="UPI QR" checked={draftSettings.showUpiQr} disabled={gstLocked} onChange={(v) => setDraftSettings((s) => ({ ...s, showUpiQr: v }))} />
              <SettingsToggleRow
                label="GPay number"
                checked={draftSettings.showGpayNumber}
                disabled={gstLocked}
                onChange={(v) => setDraftSettings((s) => ({ ...s, showGpayNumber: v }))}
              />
              {!company.upi && !company.phone && (
                <p className="flex items-start gap-1.5 pt-1 text-[11px] text-ink-faint">
                  <Info size={11} className="mt-0.5 flex-shrink-0" /> Add a UPI ID or phone number in Company settings first — there&apos;s nothing to show yet.
                </p>
              )}
            </SettingsSection>

            {isClassic && (
              <SettingsSection icon={Truck} title="Transport details">
                <SettingsToggleRow label="Show on invoice PDF" checked={showTransportDetails} onChange={setShowTransportDetails} />
                {showTransportDetails && (
                  <div className="space-y-2 bg-surface px-3 py-2.5">
                    <input
                      value={transportVehicleNo}
                      onChange={(e) => setTransportVehicleNo(e.target.value)}
                      placeholder="Vehicle number"
                      className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none"
                    />
                    <input
                      value={transportDriverName}
                      onChange={(e) => setTransportDriverName(e.target.value)}
                      placeholder="Driver name"
                      className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none"
                    />
                    <input
                      value={transportDriverPhone}
                      onChange={(e) => setTransportDriverPhone(e.target.value)}
                      placeholder="Driver contact number"
                      className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none"
                    />
                    <p className="flex items-start gap-1.5 text-[11px] text-ink-faint">
                      <Info size={11} className="mt-0.5 flex-shrink-0" /> Prints in a box before Delivery Instructions — left blank fields just don&apos;t show, and leaving all three empty hides the
                      whole box even with this switched on.
                    </p>
                  </div>
                )}
              </SettingsSection>
            )}
          </SheetBody>
          <SheetFooter>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" disabled={gstLocked} onClick={() => setDraftSettings(companyDefaults)}>
                <RotateCcw size={12} /> Reset to company defaults
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={gstLocked || savingToCompany}
                onClick={() =>
                  startSavingToCompany(async () => {
                    const { cgstRate, sgstRate, igstRate, cgstEnabled, sgstEnabled, igstEnabled, showBankDetails, showHsnSummary, showUpiQr, showGpayNumber } = draftSettings;
                    const result = await updateCompanyGstDefaults({
                      cgstRate,
                      sgstRate,
                      igstRate,
                      cgstEnabled,
                      sgstEnabled,
                      igstEnabled,
                      pdfShowBankDetails: showBankDetails,
                      pdfShowHsnSummary: showHsnSummary,
                      showUpiQr,
                      showGpayNumber,
                    });
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    setCompanyDefaults({ cgstRate, sgstRate, igstRate, cgstEnabled, sgstEnabled, igstEnabled, showBankDetails, showHsnSummary, showUpiQr, showGpayNumber });
                    toast.success('Saved as the company default for new invoices');
                  })
                }
              >
                <Building2 size={12} /> {savingToCompany ? 'Saving…' : 'Save as company default'}
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setGstSettings(draftSettings);
                setSettingsOpen(false);
              }}
            >
              <Check size={13} /> Apply
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      </div>

      {/* Print/PDF source of truth — invisible on screen, shown only by the
          @media print rules in globals.css. A sibling of the print:hidden
          wrapper above (not inside the Dialog, which is `position: fixed`
          and breaks print pagination — fixed-position elements are
          repositioned per-page by the browser's print engine, which was
          producing garbled multi-page output). Always reflects live state,
          so "Download / print" from the dialog just calls window.print().
          Collapsed to zero height with clipped overflow (not
          `display:none`): a `display:none` ancestor forces every
          descendant's layout to zero, which would make the self-measuring
          pagination in InvoiceSheet/InvoiceSheetClassic (see
          print-pagination.tsx) always read zero-height sections and
          silently fall back to "everything fits on one page" — height-0 +
          overflow-hidden keeps this invisible and footprint-free while
          still letting the browser compute real layout for anything
          inside it. */}
      <div className="h-0 overflow-hidden print:h-auto print:overflow-visible">
        <div className="invoice-print" style={PAPER_STYLE}>
          {isClassic ? (
            <InvoiceSheetClassic
              company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
              customer={customer}
              date={date}
              lines={lines}
              totals={totals}
              discountType={discountType}
              discountValue={discountValue}
              notes={notes}
              deliveryInstructions={deliveryInstructions}
              showTransportDetails={showTransportDetails}
              transportVehicleNo={transportVehicleNo}
              transportDriverName={transportDriverName}
              transportDriverPhone={transportDriverPhone}
              editable={false}
            />
          ) : (
            <InvoiceSheet
              company={previewCompany}
      upiQrDataUrl={upiQrPreview}
      gpayNumber={gpayNumberPreview}
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
      </div>
    </>
  );
}

/** Controlled variant of company-form.tsx's RateRow — that one is built for
 * an uncontrolled `<form>` + FormData submission (defaultValue/
 * defaultChecked), which doesn't fit this page's fully-controlled
 * useState-per-field pattern, so this is a small parallel component rather
 * than a shared one. Visually mirrors it. */
/** A labeled group of settings rows — one bordered card per topic (GST,
 * PDF sections, payment info) instead of the flat unbroken stack of rows
 * this sheet used to be, so each topic reads as its own unit at a glance. */
function SettingsSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg2 border border-line">
      <div className="flex items-center gap-1.5 border-b border-line bg-bg px-3 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-faint">
        <Icon size={12} className="text-brand" /> {title}
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

/** One GST tax row — the rate only shows once its own switch is on, so a
 * business that never charges IGST isn't stuck looking at an empty/greyed
 * rate box for it forever; flipping the switch back on reveals the rate
 * again at whatever it was last set to (never reset to 0). */
function SettingsRateRow({
  label,
  rate,
  enabled,
  disabled,
  onRateChange,
  onEnabledChange,
}: {
  label: string;
  rate: number;
  enabled: boolean;
  disabled?: boolean;
  onRateChange: (v: number) => void;
  onEnabledChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
      <span className="text-[12.5px] font-bold text-ink-soft">{label}</span>
      <div className="flex items-center gap-2.5">
        {enabled && (
          <label className="flex items-center gap-1 rounded-sm2 border border-line bg-bg px-2 py-1">
            <input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={rate}
              disabled={disabled}
              onChange={(e) => onRateChange(parseFloat(e.target.value) || 0)}
              className="w-10 bg-transparent text-right font-mono text-[13px] font-extrabold text-ink outline-none disabled:opacity-50"
            />
            <span className="text-[11px] font-bold text-ink-faint">%</span>
          </label>
        )}
        <Switch checked={enabled} disabled={disabled} onChange={(e) => onEnabledChange(e.target.checked)} />
      </div>
    </div>
  );
}

/** One on/off PDF-section or payment-info row — the plain counterpart to
 * SettingsRateRow for settings with no accompanying rate value. */
function SettingsToggleRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
      <span className="text-[12.5px] font-bold text-ink-soft">{label}</span>
      <Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function ProductRow({
  product,
  lines,
  onAddTier,
  onDecrementTier,
}: {
  product: Product;
  lines: Line[];
  onAddTier: (tier: PriceTier) => void;
  onDecrementTier: (unit: string) => void;
}) {
  const tiers = tiersFor(product);
  const single = tiers.length === 1;
  const qtyFor = (unit: string) => lines.find((l) => l.productId === product.id && l.unit === unit)?.qty ?? 0;
  const active = tiers.some((t) => qtyFor(t.unit) > 0);
  // e.g. "₹20.00/Piece · ₹450.00/Box (≈₹11.25/Piece)" — the per-piece figure
  // is price ÷ approxQty, purely a comparison aid; approxQty is never a
  // purchase minimum, see ProductPriceTier.approxQty.
  const tierSummary = tiers
    .map((t) => {
      const price = Number(t.price);
      const approxQty = t.approxQty != null ? Number(t.approxQty) : 0;
      const perPiece = approxQty > 0 ? price / approxQty : null;
      return `${fmtInr(price)}/${formatUnit(t.unit)}${perPiece != null ? ` (≈${fmtInr(perPiece)}/Piece)` : ''}`;
    })
    .join(' · ');
  return (
    <div className={`flex items-start gap-2 rounded-lg2 px-1.5 py-1.5 transition-colors hover:bg-bg ${active ? 'bg-brand-light' : ''}`}>
      <span className={`mt-0.5 flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-sm2 ${categoryTile(product.category)}`}>
        <CategoryIcon category={product.category} size={12} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="truncate text-[11.5px] font-bold text-ink">{product.name}</div>
        <div className="truncate text-[10px] text-ink-faint">{tierSummary}</div>
      </div>
      {/* A product with exactly one pricing tier keeps one compact counter
          here. Two or more tiers (e.g. Box + Piece + Kg) stack vertically
          on the right instead, each tinted its own accent color, so each
          unit's control stays visually distinct without eating horizontal
          width the way an equal-column grid underneath used to. */}
      {single ? (
        <QtyCounter qty={qtyFor(tiers[0].unit)} onAdd={() => onAddTier(tiers[0])} onDecrement={() => onDecrementTier(tiers[0].unit)} name={product.name} />
      ) : (
        <div className="flex flex-shrink-0 flex-col gap-1">
          {tiers.map((t, i) => (
            <TierCounterRow
              key={t.id ?? `${t.unit}-${i}`}
              accent={TIER_ACCENTS[i % TIER_ACCENTS.length]}
              caption={formatUnit(t.unit)}
              qty={qtyFor(t.unit)}
              onAdd={() => onAddTier(t)}
              onDecrement={() => onDecrementTier(t.unit)}
              name={`${product.name} (${formatUnit(t.unit)})`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact right-aligned +/- pill, used inline for products with exactly
 * one pricing tier (nothing to choose between). */
function QtyCounter({ qty, onAdd, onDecrement, name }: { qty: number; onAdd: () => void; onDecrement: () => void; name: string }) {
  if (qty > 0) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1.5 rounded-sm2 border-[1.5px] border-brand bg-surface p-0.5">
        <button onClick={onDecrement} aria-label={`Decrease ${name} quantity`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <Minus size={10} />
        </button>
        <span key={qty} className="min-w-[18px] animate-bump text-center font-mono text-[11.5px] font-extrabold">
          {qty}
        </span>
        <button onClick={onAdd} aria-label={`Increase ${name} quantity`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <Plus size={10} />
        </button>
      </div>
    );
  }
  return (
    <button onClick={onAdd} className="flex flex-shrink-0 items-center gap-1 rounded-sm2 bg-brand px-2.5 py-1 text-[11px] font-extrabold text-white">
      <Plus size={11} /> Add
    </button>
  );
}

// Decorative, per-tier-position accents (not tied to any status/semantic
// meaning — unlike --red/--green/--gold, which stay reserved for
// error/success/warning). Cycles for a 4th+ tier.
const TIER_ACCENTS = ['border-l-brand', 'border-l-gold', 'border-l-chrome', 'border-l-ink-faint'];

/** One pricing tier's +/- control, stacked vertically alongside its
 * siblings (see ProductRow) — a colored left edge is each tier's only
 * visual distinguisher, so the caption/counter itself stays as compact as
 * the single-tier QtyCounter. */
function TierCounterRow({
  accent,
  caption,
  qty,
  onAdd,
  onDecrement,
  name,
}: {
  accent: string;
  caption: string;
  qty: number;
  onAdd: () => void;
  onDecrement: () => void;
  name: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 rounded-sm2 border-l-[3px] ${accent} bg-bg pl-1.5 pr-1 py-0.5`}>
      <span className="w-[34px] flex-shrink-0 truncate text-[8.5px] font-bold uppercase tracking-wide text-ink-faint">{caption}</span>
      {qty > 0 ? (
        <div className="flex items-center gap-1 rounded-sm2 border border-line bg-surface p-0.5">
          <button onClick={onDecrement} aria-label={`Decrease ${name} quantity`} className="flex h-[16px] w-[16px] items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt">
            <Minus size={9} />
          </button>
          <span key={qty} className="min-w-[14px] animate-bump text-center font-mono text-[10.5px] font-extrabold">
            {qty}
          </span>
          <button onClick={onAdd} aria-label={`Increase ${name} quantity`} className="flex h-[16px] w-[16px] items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt">
            <Plus size={9} />
          </button>
        </div>
      ) : (
        <button onClick={onAdd} aria-label={`Add ${name}`} className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm2 bg-brand text-white">
          <Plus size={10} />
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
  const [unit, setUnit] = useState('Piece');
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
      const tierUnit = unit.trim() || 'pc';
      formData.set('name', name.trim());
      formData.set('category', 'Uncategorized');
      formData.set('unit', tierUnit);
      formData.set('price', String(rateNum));
      if (packQtyNum > 0) formData.set('packQty', String(packQtyNum));
      formData.set('tiers', JSON.stringify([{ unit: tierUnit, price: rateNum, approxQty: packQtyNum > 0 ? packQtyNum : null }]));
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
    setUnit('Piece');
    setQty('1');
    setRate('');
    setPackQty('');
    setSaveAsProduct(false);
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg2 border border-line bg-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="Unit"
          name="unit"
          as="select"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          options={(UNITS.includes(unit) ? UNITS : [unit, ...UNITS]).map((u) => ({ value: u, label: formatUnit(u) }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Qty" name="qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} mono />
        <Field label="Rate (₹)" name="rate" type="number" value={rate} onChange={(e) => setRate(e.target.value)} mono />
      </div>
      <label className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-soft">
        <input type="checkbox" checked={saveAsProduct} onChange={(e) => setSaveAsProduct(e.target.checked)} className="h-3.5 w-3.5 rounded-sm2 border-line accent-brand" />
        Save this as a product for next time
      </label>
      {saveAsProduct && unit.trim().toLowerCase() !== 'piece' && (
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
  const message = `Invoice from ${company.name}\nBill to: ${customerDisplayName(customer)}\nAmount due: ${fmtInr(amountDue)}\nDue date: ${due}\n\nThank you for your business!`;
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
          <a href={waUrl} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 rounded-sm2 bg-surface-alt px-4 py-2.5 text-[13px] font-bold text-ink">
            <MessageCircle size={14} /> Share via WhatsApp{waDigits ? '' : ' (no phone on file)'}
          </a>
          <a href={mailUrl} className="flex items-center justify-center gap-2 rounded-sm2 border border-line px-4 py-2.5 text-[13px] font-bold text-ink">
            <Mail size={14} /> Share via Email{customer.email ? '' : ' (no email on file)'}
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
