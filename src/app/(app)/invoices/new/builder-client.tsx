'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Minus,
  ArrowLeft,
  Eye,
  FileText,
  CheckCircle2,
  ShoppingCart,
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
  Download,
  MoreHorizontal,
  ChevronDown,
  MessageCircle,
  Copy,
  Trash2,
  Gift,
  ReceiptText,
  FileMinus,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { createInvoice, updateInvoice, type InvoiceInput } from '@/actions/invoices';
import { listCustomersForBilling, getCustomerBalance } from '@/actions/billing';
import { updateCompanyGstDefaults } from '@/actions/company';
import { frequentProductIdsForCustomer } from '@/actions/products';
import { getCustomerPriceMap, listActiveSchemes } from '@/actions/pricing';
import { getCostsForBilling, getOldestBatches } from '@/actions/inventory';
import { useCreateCustomer } from '@/hooks/use-customers';
import { useCreateProduct } from '@/hooks/use-products';
import { useDeletePayment, useDuplicateInvoice, useWhatsAppShare } from '@/hooks/use-invoices';
import { DeleteInvoiceDialog } from '@/components/invoices/delete-invoice-dialog';
import { BelowCostPanel, LastOrderCard, ShortagePanel, type BelowCostLine, type ShortageFix } from '@/components/invoices/builder-assist';
import { StockInSheet } from '@/components/inventory/stock-in-sheet';
import { useStockProducts } from '@/hooks/use-inventory';
import type { LastOrder } from '@/actions/invoices';
import { invalidateBusinessData } from '@/hooks/use-invalidate';
import { computeTotals, fmtInr, formatUnit, type LineInput } from '@/lib/gst';
import { upiQrDataUrl } from '@/lib/qr';
import { todayIst } from '@/lib/dates';
import { formatStock, round6, unitFactor } from '@/lib/stock-units';
import { isGstLayout, type InvoiceTemplateName } from '@/lib/invoice-template';
import type { EditorInvoice } from '@/lib/invoice-editor-data';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetIcon, SheetBody, SheetFooter, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { StateSelect } from '@/components/ui/location-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceCompletenessChecklist } from '@/components/invoices/invoice-completeness-checklist';
import { ResponsiveSheetScale } from '@/components/invoices/responsive-sheet-scale';
import { RecordPaymentDialog } from '@/components/invoices/record-payment-dialog';
import { GenerateEinvoiceButton } from '@/components/invoices/compliance/generate-einvoice-button';
import { GenerateEwaybillButton } from '@/components/invoices/compliance/generate-ewaybill-button';
import { ActivityTimeline } from '@/components/activity/activity-timeline';
import { useCurrentUser } from '@/components/current-user';
import { PdfDownloadButton } from '@/components/print/pdf-download-button';
import { pdfFileName } from '@/components/print/format';
import { hashColor, initials } from '@/lib/avatar';
import { customerDisplayName } from '@/lib/customer';
import { UNITS } from '@/lib/units';
import { PAPER_STYLE } from '@/lib/paper-theme';
import type { PdfLayout } from '@/lib/pdf-layout';

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
  trackStock?: boolean;
  stockQty?: string | number;
  lowStockAt?: string | number | null;
  /** Default line discount % (Product.discount). */
  discount?: string | number;
};

/** Every pricing option for a product, oldest-field-compatible: falls back
 * to a single synthetic tier built from unit/price/packQty if a product
 * somehow has none. */
function tiersFor(p: Product): PriceTier[] {
  if (p.priceTiers && p.priceTiers.length > 0) return p.priceTiers;
  return [{ unit: p.unit, price: p.price, approxQty: p.packQty ?? null }];
}
type Company = {
  name: string;
  address: string;
  /** CLEAN product-row style for the live preview (src/lib/settings.ts). */
  pdfItemRows?: 'none' | 'lines' | 'zebra';
  pdfLayout?: PdfLayout;
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
  pdfShowItemDiscount: boolean;
  pdfShowBillDiscount: boolean;
  defaultHsn: string;
  invoiceTemplate: InvoiceTemplateName;
  fssaiNo?: string | null;
  pincode?: string | null;
  pan?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  signatoryName?: string | null;
  signatureUrl?: string | null;
  nicUsername?: string | null;
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
// `free` marks the zero-rate line an offer ("buy 10, get 1 free") adds; it
// shares its product+unit with the paid line, so lookups that find "the"
// line for a product+unit skip it.
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
  stockQty?: number | null;
  free?: boolean;
};

type Scheme = { id: string; productId: string; unit: string; buyQty: number; freeQty: number; name: string | null };

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

// Recovery-only local draft for a brand-new invoice — survives an accidental
// refresh/close of the tab until it's actually saved. Kept per login (a login
// belongs to one company), so a shared browser never shows one company's
// unsaved bill — customer details and all — to the next company that signs in.
const DRAFT_KEY_PREFIX = 'invozy_invoice_draft';
/** The pre-multi-company key, shared by everyone on the browser — removed on sight. */
const LEGACY_DRAFT_KEY = 'invozy_invoice_draft';

const sameUnit = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const clampPct = (v: number) => Math.min(Math.max(Number.isFinite(v) ? v : 0, 0), 100);

function categoryTile(cat: string) {
  return CATEGORY_TILE[cat] ?? 'bg-surface-alt text-ink-soft';
}
function CategoryIcon({ category, size = 15 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICON[category] ?? Package;
  return <Icon size={size} />;
}

type SaveMode = 'draft' | 'send' | 'keep' | 'paid';

export function BuilderClient({
  products,
  company,
  editInvoice,
  initialMode = 'edit',
}: {
  products: Product[];
  company: Company;
  editInvoice?: EditorInvoice | null;
  initialMode?: 'edit' | 'preview';
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Deletes are owner-only on the server; staff don't see the buttons.
  const { isOwner, id: currentUserId } = useCurrentUser();
  const DRAFT_KEY = `${DRAFT_KEY_PREFIX}:${currentUserId}`;
  const [mode, setMode] = useState<'edit' | 'preview'>(initialMode);
  const [customer, setCustomer] = useState<Customer | null>((editInvoice?.customer as Customer) ?? null);
  const [custQuery, setCustQuery] = useState('');
  const [custCursor, setCustCursor] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [lines, setLines] = useState<Line[]>(editInvoice?.lines ?? []);
  const [productQuery, setProductQuery] = useState('');
  const [frequentIds, setFrequentIds] = useState<string[]>([]);
  // Bill-level discount, applied after every line's own Disc %. Its own
  // labelled field in the left pane — never mixed with the per-line % (the
  // old "apply this % to every line" checkbox that switched between the two
  // was the source of the 500%-discount and double-discount bugs).
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FLAT'>(editInvoice?.overallDiscountType ?? 'PERCENT');
  const [discountValue, setDiscountValue] = useState(editInvoice?.overallDiscountValue ?? 0);
  // "Set every item to __%" — a one-shot action, not a mode. Remembered so
  // items added afterwards start at the same %.
  const [setAllPct, setSetAllPct] = useState(() => {
    const ds = (editInvoice?.lines ?? []).filter((l) => !l.free).map((l) => l.discount);
    return ds.length && ds.every((d) => d === ds[0]) && ds[0] > 0 ? String(ds[0]) : '';
  });
  const [newLineDiscount, setNewLineDiscount] = useState(0);
  const [notes, setNotes] = useState(editInvoice?.notes ?? '');
  const [deliveryInstructions, setDeliveryInstructions] = useState(editInvoice?.deliveryInstructions ?? '');
  const [showTransportDetails, setShowTransportDetails] = useState(editInvoice?.showTransportDetails ?? false);
  const [transportVehicleNo, setTransportVehicleNo] = useState(editInvoice?.transportVehicleNo ?? '');
  const [transportDriverName, setTransportDriverName] = useState(editInvoice?.transportDriverName ?? '');
  const [transportDriverPhone, setTransportDriverPhone] = useState(editInvoice?.transportDriverPhone ?? '');
  // India-time "today" — the old UTC date was yesterday's before 5:30 AM IST.
  const [date, setDate] = useState(() => editInvoice?.date ?? todayIst());
  const [due, setDue] = useState(() => editInvoice?.due ?? todayIst());
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [outstandingElsewhere, setOutstandingElsewhere] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Owner's "save anyway" when stock is short: the save it confirms.
  const [forceSaveMode, setForceSaveMode] = useState<SaveMode | null>(null);
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
  // amend API, only cancel-within-24h) — the settings sheet goes read-only.
  // The server enforces this independently too.
  const gstLocked = !!editInvoice?.irn;
  const [draftSettings, setDraftSettings] = useState(gstSettings);
  useEffect(() => {
    if (settingsOpen) setDraftSettings(gstSettings);
  }, [settingsOpen, gstSettings]);
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
  const duplicateInvoice = useDuplicateInvoice();
  const deletePayment = useDeletePayment();
  const whatsApp = useWhatsAppShare();

  const isGst = isGstLayout(company.invoiceTemplate);
  const savedId = editInvoice?.id ?? null;
  const status = editInvoice?.status ?? 'DRAFT';
  const balanceDue = editInvoice ? Math.max(editInvoice.total - editInvoice.amountPaid, 0) : 0;

  // Live-preview-only UPI QR — the saved PDF generates its own server-side.
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
  const gpayNumberPreview = gstSettings.showGpayNumber ? company.phone || company.altPhone || null : null;

  // Restore an unsaved new-invoice draft left over from a refresh/accidental
  // close, once — never when editing a saved invoice.
  useEffect(() => {
    if (editInvoice) {
      hydratedDraftRef.current = true;
      return;
    }
    try {
      localStorage.removeItem(LEGACY_DRAFT_KEY);
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft && ((draft.lines?.length ?? 0) > 0 || draft.customer)) {
          if (draft.customer) setCustomer(draft.customer);
          if (draft.lines) setLines(draft.lines);
          // Drafts saved by the old builder may carry its "apply % to every
          // line" flag; those lines already hold the %, so the bill-level
          // value is dropped instead of being applied a second time.
          if (draft.discountType) setDiscountType(draft.discountType);
          if (typeof draft.discountValue === 'number' && !draft.applyDiscountPerItem && draft.v === 2) setDiscountValue(draft.discountValue);
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
                setDate(todayIst());
                setDue(todayIst());
                setNotes('');
                setDeliveryInstructions('');
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

  useEffect(() => {
    if (!hydratedDraftRef.current || editInvoice) return;
    try {
      if (!customer && lines.length === 0) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 2, customer, lines, discountType, discountValue, date, due, notes, deliveryInstructions }));
    } catch {
      // best-effort only
    }
  }, [customer, lines, discountType, discountValue, date, due, notes, deliveryInstructions, editInvoice]);

  // Unsaved changes = the savable state differs from what was last loaded or
  // saved. Decides whether Download PDF can stream the stored PDF instantly
  // or must save first. A snapshot comparison rather than "did any effect
  // fire", which would misfire under React's double-invoked dev effects.
  const snapshot = JSON.stringify([customer?.id, lines, discountType, discountValue, date, due, notes, deliveryInstructions, showTransportDetails, transportVehicleNo, transportDriverName, transportDriverPhone, gstSettings]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = !editInvoice || snapshot !== savedSnapshot;

  // Bill To: the whole active directory, loaded once and filtered locally —
  // instant, and no out-of-order search responses (see listCustomersForBilling).
  const customersQuery = useQuery({ queryKey: ['customers', 'billing'], queryFn: () => listCustomersForBilling(), staleTime: 5 * 60_000 });
  const customerMatches = useMemo(() => {
    const all = (customersQuery.data ?? []) as Customer[];
    const term = custQuery.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return all
      .filter((c) => {
        if (!term) return !c.guest;
        return (
          c.name.toLowerCase().includes(term) ||
          (c.shopName ?? '').toLowerCase().includes(term) ||
          (c.contact ?? '').toLowerCase().includes(term) ||
          (digits.length >= 3 && ((c.phone ?? '').replace(/\D/g, '').includes(digits) || (c.altPhone ?? '').replace(/\D/g, '').includes(digits)))
        );
      })
      .sort((a, b) => customerDisplayName(a).localeCompare(customerDisplayName(b)));
  }, [customersQuery.data, custQuery]);
  const directorySize = (customersQuery.data ?? []).filter((c) => !c.guest).length;
  useEffect(() => setCustCursor(0), [custQuery]);

  useEffect(() => {
    if (!customer) {
      setFrequentIds([]);
      setOutstandingElsewhere(0);
      return;
    }
    let cancelled = false;
    frequentProductIdsForCustomer(customer.id)
      .then((ids) => !cancelled && setFrequentIds(ids))
      .catch(() => {});
    // Leaves out this invoice itself — the old ledger figure counted it too.
    getCustomerBalance(customer.id, savedId ?? undefined)
      .then((r) => !cancelled && setOutstandingElsewhere(r.outstanding))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [customer, savedId]);

  // Customer-specific prices replace the catalog price when a product is
  // added for this customer; offers ("buy 10, get 1 free") are suggested in
  // the left pane once a line qualifies.
  const pricesQuery = useQuery({
    queryKey: ['pricing', 'customer', customer?.id],
    queryFn: () => getCustomerPriceMap(customer!.id),
    enabled: !!customer,
    staleTime: 60_000,
  });
  const specialPrices = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pricesQuery.data ?? []) m.set(`${p.productId}|${p.unit.trim().toLowerCase()}`, Number(p.price));
    return m;
  }, [pricesQuery.data]);
  const schemesQuery = useQuery({ queryKey: ['pricing', 'schemes'], queryFn: () => listActiveSchemes(), staleTime: 5 * 60_000 });

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Oldest batch still on hand per tracked product — pre-filled on new
  // lines so the oldest stock goes out first and the batch prints on the
  // invoice (FSSAI traceability). One request for the whole catalog.
  const trackedIds = useMemo(() => products.filter((p) => p.trackStock).map((p) => p.id), [products]);
  const batchesQuery = useQuery({
    queryKey: ['inventory', 'oldest-batches', trackedIds],
    queryFn: () => getOldestBatches(trackedIds),
    enabled: trackedIds.length > 0,
    staleTime: 60_000,
  });

  const filteredProducts = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(productQuery.toLowerCase())), [products, productQuery]);
  const frequentProducts = useMemo(() => {
    if (productQuery.trim() || frequentIds.length === 0) return [];
    return frequentIds.map((id) => productById.get(id)).filter((p): p is Product => !!p);
  }, [frequentIds, productById, productQuery]);
  // The frequent shortlist isn't repeated in the full list below it.
  const listProducts = useMemo(() => {
    if (!frequentProducts.length) return filteredProducts;
    const shown = new Set(frequentProducts.map((p) => p.id));
    return filteredProducts.filter((p) => !shown.has(p.id));
  }, [filteredProducts, frequentProducts]);

  const PRODUCTS_PER_PAGE = 20;
  const [productPage, setProductPage] = useState(1);
  useEffect(() => setProductPage(1), [productQuery]);
  const pagedProducts = useMemo(() => listProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE), [listProducts, productPage]);

  // ---- Stock --------------------------------------------------------------
  // What this invoice had already taken out of stock when it was loaded —
  // every saved invoice holds its lines, drafts included (except a draft
  // saved before drafts took stock) — that stock is "ours" again while
  // editing, so re-saving an unchanged invoice never reports a false shortage.
  const alreadyTaken = useMemo(() => {
    const m = new Map<string, number>();
    if (!editInvoice?.stockTaken) return m;
    for (const l of editInvoice.lines) {
      if (!l.productId) continue;
      const p = productById.get(l.productId);
      const q = l.stockQty ?? (p ? l.qty * unitFactor(p, l.unit) : 0);
      m.set(l.productId, round6((m.get(l.productId) ?? 0) + q));
    }
    return m;
  }, [editInvoice, productById]);
  const needed = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) {
      if (!l.productId) continue;
      const p = productById.get(l.productId);
      if (!p) continue;
      m.set(l.productId, round6((m.get(l.productId) ?? 0) + l.qty * unitFactor(p, l.unit)));
    }
    return m;
  }, [lines, productById]);
  /** Main-unit stock still free for this invoice to use, or null when the
   * product isn't tracked. */
  function remainingFor(p: Product): number | null {
    if (!p.trackStock) return null;
    return round6(Number(p.stockQty ?? 0) + (alreadyTaken.get(p.id) ?? 0) - (needed.get(p.id) ?? 0));
  }
  const shortages = useMemo(() => {
    const out: ShortageFix[] = [];
    for (const [id, need] of needed) {
      const p = productById.get(id);
      if (!p?.trackStock) continue;
      const have = Number(p.stockQty ?? 0) + (alreadyTaken.get(id) ?? 0);
      if (need <= have + 1e-6) continue;
      // A one-tap fix only when the product is on a single line — with two
      // (Box and Piece, say) there's no one right way to split what's left.
      const onLines = lines.filter((l) => l.productId === id);
      const only = onLines.length === 1 ? onLines[0] : null;
      const fitQty = only ? Math.floor(have / unitFactor(p, only.unit) + 1e-6) : 0;
      out.push({
        productId: id,
        name: p.name,
        have: formatStock(have, p),
        need: formatStock(need, p),
        fit: only && fitQty >= 1 ? { lineId: only.lineId, qty: fitQty, unit: only.unit } : null,
        removeLineId: only && fitQty < 1 ? only.lineId : null,
      });
    }
    return out;
  }, [needed, alreadyTaken, productById, lines]);
  const blocked = shortages.length > 0;

  // Add stock straight from a shortage, without leaving the invoice. The
  // page's products are server data, so closing the sheet refreshes them.
  const [stockInFor, setStockInFor] = useState<string | null>(null);
  const { data: stockProducts = [] } = useStockProducts(!!stockInFor);

  // ---- Below cost (owner only) -------------------------------------------
  const costIds = useMemo(() => [...new Set(lines.filter((l) => l.productId && !l.free && l.rate > 0).map((l) => l.productId!))].sort(), [lines]);
  const costsQuery = useQuery({
    queryKey: ['pricing', 'costs', costIds],
    queryFn: () => getCostsForBilling(costIds),
    enabled: isOwner && costIds.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const belowCost = useMemo(() => {
    const costs = costsQuery.data ?? {};
    const out: BelowCostLine[] = [];
    for (const l of lines) {
      if (!l.productId || l.free || !(l.rate > 0)) continue;
      const p = productById.get(l.productId);
      const cost = costs[l.productId];
      if (!p || cost == null) continue;
      const unitCost = cost * unitFactor(p, l.unit);
      const net = l.rate * (1 - (l.discount || 0) / 100);
      if (net + 0.005 < unitCost) out.push({ lineId: l.lineId, name: l.name, unit: l.unit, net, cost: unitCost });
    }
    return out;
  }, [lines, costsQuery.data, productById]);

  // ---- Same as last time -------------------------------------------------
  const [lastOrderDismissedFor, setLastOrderDismissedFor] = useState<string | null>(null);

  // ---- Offers -------------------------------------------------------------
  const offers = useMemo(() => {
    const out: { scheme: Scheme; line: Line; eligible: number; given: number }[] = [];
    for (const s of (schemesQuery.data ?? []) as Scheme[]) {
      const line = lines.find((l) => !l.free && l.productId === s.productId && sameUnit(l.unit, s.unit));
      if (!line || line.qty < Number(s.buyQty)) continue;
      const eligible = Math.floor(line.qty / Number(s.buyQty)) * Number(s.freeQty);
      const given = lines.find((l) => l.free && l.productId === s.productId && sameUnit(l.unit, s.unit))?.qty ?? 0;
      out.push({ scheme: s, line, eligible, given });
    }
    return out;
  }, [schemesQuery.data, lines]);
  function applyOffer(o: { scheme: Scheme; line: Line; eligible: number }) {
    setLines((prev) => {
      const free = prev.find((l) => l.free && l.productId === o.scheme.productId && sameUnit(l.unit, o.scheme.unit));
      if (free) return prev.map((l) => (l === free ? { ...l, qty: o.eligible } : l));
      return [
        ...prev,
        { ...o.line, lineId: crypto.randomUUID(), name: `${o.line.name} (Free)`, qty: o.eligible, rate: 0, discount: 0, stockQty: null, free: true },
      ];
    });
    toast.success(`Added ${o.eligible} free ${formatUnit(o.scheme.unit)}`);
  }

  const totals = useMemo(() => {
    const lineInputs: LineInput[] = lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount }));
    return computeTotals(lineInputs, { type: discountType, value: discountValue }, gstSettings, company.state, customer?.state ?? company.state);
  }, [lines, discountType, discountValue, company.state, customer, gstSettings]);

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

  const grossAmount = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const lineDiscountTotal = lines.reduce((s, l) => s + l.qty * l.rate * (l.discount / 100), 0);
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);

  // A product can have multiple pricing tiers (e.g. "Box" and a loose
  // "Piece") — each becomes an independent line keyed by (productId, unit).
  function addProductTier(p: Product, tier: PriceTier) {
    const unit = tier.unit;
    const special = specialPrices.get(`${p.id}|${unit.trim().toLowerCase()}`);
    const rate = special ?? Number(tier.price);
    setLines((prev) => {
      const existing = prev.find((l) => !l.free && l.productId === p.id && l.unit === unit);
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      const isPrimary = unit === p.unit;
      toast.success(`${p.name} added${isPrimary ? '' : ` (${formatUnit(unit)})`}${special != null ? ' at special price' : ''}`);
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: p.id,
          name: p.name,
          unit,
          qty: 1,
          rate,
          // The product's own discount when it has one, otherwise the last
          // "Set every item to __%" value.
          discount: Number(p.discount) > 0 ? clampPct(Number(p.discount)) : newLineDiscount,
          packQty: isPrimary ? p.packQty : null,
          hsn: p.hsn || company.defaultHsn,
          batch: batchesQuery.data?.[p.id]?.batchNo ?? null,
          altUnit: isPrimary ? p.altUnit : null,
          altQtyPerUnit: isPrimary && p.altQtyPerUnit ? Number(p.altQtyPerUnit) : null,
        },
      ];
    });
  }
  /** Bills a customer's previous order again — same products, units,
   * quantities and line discounts, at today's (or their special) prices.
   * Products since removed from the catalog are skipped and counted. */
  function repeatOrder(order: LastOrder) {
    const added: Line[] = [];
    let skipped = 0;
    for (const it of order.items) {
      const p = productById.get(it.productId);
      const tier = p ? tiersFor(p).find((t) => sameUnit(t.unit, it.unit)) : undefined;
      if (!p || !tier) {
        skipped++;
        continue;
      }
      const isPrimary = sameUnit(tier.unit, p.unit);
      added.push({
        lineId: crypto.randomUUID(),
        productId: p.id,
        name: p.name,
        unit: tier.unit,
        qty: it.qty,
        rate: specialPrices.get(`${p.id}|${tier.unit.trim().toLowerCase()}`) ?? Number(tier.price),
        discount: it.discount,
        packQty: isPrimary ? p.packQty : null,
        hsn: p.hsn || company.defaultHsn,
        batch: batchesQuery.data?.[p.id]?.batchNo ?? null,
        altUnit: isPrimary ? p.altUnit : null,
        altQtyPerUnit: isPrimary && p.altQtyPerUnit ? Number(p.altQtyPerUnit) : null,
      });
    }
    if (!added.length) {
      toast.error('None of those products are in the catalog any more.');
      return;
    }
    setLines((prev) => [...prev, ...added]);
    toast.success(`Added ${added.length} item${added.length === 1 ? '' : 's'} from ${order.number}${skipped ? ` — ${skipped} no longer in the catalog` : ''}`);
  }
  function decrementProductTier(productId: string, unit: string) {
    setLines((prev) => {
      const l = prev.find((x) => !x.free && x.productId === productId && x.unit === unit);
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
        discount: newLineDiscount,
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
    const safe = patch.discount !== undefined ? { ...patch, discount: clampPct(Number(patch.discount)) } : patch;
    setLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, ...safe } : l)));
  }
  function removeLine(lineId: string) {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }
  function applyDiscountToAll() {
    const raw = parseFloat(setAllPct);
    const pct = clampPct(raw);
    if (Number.isFinite(raw) && raw !== pct) toast.info(`Discounts are kept between 0 and 100% — set to ${pct}%`);
    setSetAllPct(String(pct));
    setNewLineDiscount(pct);
    setLines((prev) => prev.map((l) => (l.free ? l : { ...l, discount: pct })));
    if (lines.length) toast.success(`Every item set to ${pct}% discount`);
  }
  function changeBillDiscount(v: string) {
    const n = Math.max(parseFloat(v) || 0, 0);
    setDiscountValue(discountType === 'PERCENT' ? Math.min(n, 100) : n);
  }

  function buildPayload(saveMode: SaveMode, allowNegativeStock = false): InvoiceInput {
    return {
      customerId: customer!.id,
      date,
      due,
      items: lines,
      overallDiscountType: discountType,
      overallDiscountValue: discountType === 'FLAT' ? Math.min(discountValue, grossAmount - lineDiscountTotal) : discountValue,
      notes,
      deliveryInstructions,
      showTransportDetails,
      transportVehicleNo,
      transportDriverName,
      transportDriverPhone,
      // "keep" (plain Save) preserves the invoice's current sent-ness; the
      // server derives the final status from payments either way.
      markSent: saveMode === 'send' || saveMode === 'paid' || (saveMode === 'keep' && status !== 'DRAFT'),
      markPaid: saveMode === 'paid',
      allowNegativeStock,
      ...gstSettings,
    };
  }

  function validate(allowNegativeStock = false): boolean {
    if (!customer) {
      setError('Select a customer first');
      toast.error('Select a customer first');
      return false;
    }
    if (lines.length === 0) {
      setError('Add at least one product');
      toast.error('Add at least one product');
      return false;
    }
    // Every save takes stock, drafts included.
    if (blocked && !allowNegativeStock) {
      const msg = `Not enough stock for ${shortages.length === 1 ? shortages[0].name : `${shortages.length} items`} — reduce the quantity or add stock.`;
      setError(msg);
      toast.error(msg);
      return false;
    }
    setError(undefined);
    return true;
  }

  /** Saves (creating or updating — a brand-new invoice that was already
   * saved once, e.g. by Download PDF, is updated, never duplicated) and
   * resolves to the saved id, or null on failure. */
  async function persist(saveMode: SaveMode, allowNegativeStock = false): Promise<string | null> {
    const savingSnapshot = snapshot;
    try {
      const payload = buildPayload(saveMode, allowNegativeStock);
      const result = savedId ? await updateInvoice(savedId, payload) : await createInvoice(payload);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return null;
      }
      if (result.warning) toast.warning(result.warning);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // best-effort only
      }
      setSavedSnapshot(savingSnapshot);
      invalidateBusinessData(queryClient);
      return result.invoiceId ?? null;
    } catch (e: any) {
      const msg = e?.message ?? 'Could not save the invoice. Check your connection and try again.';
      setError(msg);
      toast.error(msg);
      return null;
    }
  }

  function save(saveMode: SaveMode, allowNegativeStock = false) {
    if (!validate(allowNegativeStock)) return;
    startSaving(async () => {
      const id = await persist(saveMode, allowNegativeStock);
      if (!id) return;
      toast.success(
        saveMode === 'paid' ? 'Saved and marked paid' : saveMode === 'send' ? 'Saved and marked sent' : saveMode === 'draft' ? 'Saved as draft' : 'Invoice saved'
      );
      // A new invoice moves to its own URL (the editor of the saved invoice);
      // a saved one just reloads its server data in place.
      if (!savedId) router.replace(`/invoices/${id}`);
      else router.refresh();
    });
  }

  /** Download PDF — an already-saved, unchanged invoice streams its stored
   * PDF straight away; otherwise it's saved first (keeping its status — the
   * old builder turned a sent invoice back into a draft here) and then
   * downloaded. */
  function downloadPdf() {
    if (savedId && !dirty) {
      window.location.href = `/api/invoices/${savedId}/pdf`;
      return;
    }
    if (!validate()) return;
    startSaving(async () => {
      const id = await persist('keep');
      if (!id) return;
      toast.success('Saved — preparing your PDF…');
      window.location.href = `/api/invoices/${id}/pdf`;
      if (!savedId) router.replace(`/invoices/${id}`);
      else router.refresh();
    });
  }

  function shareOnWhatsApp(reminder = false) {
    if (!savedId || !customer) return;
    const win = window.open('', '_blank');
    const amount = reminder ? balanceDue : totals.total;
    whatsApp.mutate(
      {
        invoiceId: savedId,
        phone: customer.phone,
        win,
        reminder,
        buildMessage: (url) =>
          reminder
            ? `Hello ${customerDisplayName(customer)}, a gentle reminder from ${company.name}: invoice ${editInvoice?.number} has ${fmtInr(amount)} due${due ? ` (due ${due})` : ''}.\n\nView invoice: ${url}\n\nThank you!`
            : `Hello ${customerDisplayName(customer)}, here is your invoice ${editInvoice?.number} from ${company.name} for ${fmtInr(amount)}.\n\nView / download: ${url}\n\nThank you for your business!`,
      },
      { onError: (e: any) => toast.error(e?.message ?? 'Could not create the share link') }
    );
  }

  function duplicate() {
    if (!savedId) return;
    duplicateInvoice.mutate(savedId, {
      onSuccess: (r) => {
        toast.success('Duplicated as a new draft');
        if (r.invoiceId) router.push(`/invoices/${r.invoiceId}`);
      },
      onError: (e: any) => toast.error(e?.message ?? 'Could not duplicate'),
    });
  }

  const hasItems = lines.length > 0;
  const projectedBalance = outstandingElsewhere + totals.total;
  const creditLimit = Number(customer?.creditLimit ?? 0);
  const overLimit = creditLimit > 0 && projectedBalance >= creditLimit;

  const checklistItems = [
    { label: 'Company GSTIN', done: !!company.gstin, href: '/company' },
    { label: 'Company FSSAI license no.', done: !!company.fssaiNo, href: '/company' },
    { label: 'Company logo', done: !!company.logoUrl, href: '/company' },
    { label: 'Bank details', done: !!(company.bankName && company.bankAcc && company.ifsc), href: '/company' },
    { label: 'Terms', done: !!company.terms, href: '/company' },
    { label: 'Authorised signatory (name or e-signature)', done: !!(company.signatoryName || company.signatureUrl), href: '/company' },
    ...(customer ? [{ label: `${customerDisplayName(customer)}'s contact / phone`, done: !!(customer.contact || customer.phone), href: '/customers' }] : []),
    // A blank HSN is filled with the company default on save.
    ...(lines.length > 0 ? [{ label: 'HSN/SAC code on every line item', done: lines.every((l) => !!(l.hsn || company.defaultHsn)) }] : []),
  ];

  const sheetProps = {
    company: previewCompany,
    upiQrDataUrl: upiQrPreview,
    gpayNumber: gpayNumberPreview,
    customer,
    date,
    invoiceNumber: editInvoice?.number,
    lines,
    totals,
    discountType,
    discountValue,
  };
  const renderSheet = (editable: boolean) =>
    isGst ? (
      <InvoiceSheetClassic
        {...sheetProps}
        variant={company.invoiceTemplate === 'CLEAN' ? 'clean' : 'classic'}
        due={due}
        irn={editInvoice?.irn}
        ackNo={editInvoice?.ackNo}
        ackDate={editInvoice?.ackDate}
        amountPaid={editInvoice?.amountPaid}
        notes={notes}
        deliveryInstructions={deliveryInstructions}
        showTransportDetails={showTransportDetails}
        transportVehicleNo={transportVehicleNo}
        transportDriverName={transportDriverName}
        transportDriverPhone={transportDriverPhone}
        editable={editable}
        {...(editable
          ? {
              onIncrement: incrementLineQty,
              onDecrement: decrementLineQty,
              onUpdateLine: updateLine,
              onRemoveLine: removeLine,
              onNotesChange: setNotes,
              onDeliveryInstructionsChange: setDeliveryInstructions,
              onTransportVehicleNoChange: setTransportVehicleNo,
              onTransportDriverNameChange: setTransportDriverName,
              onTransportDriverPhoneChange: setTransportDriverPhone,
            }
          : {})}
      />
    ) : (
      <InvoiceSheet
        {...sheetProps}
        due={due}
        amountPaid={editInvoice?.amountPaid}
        editable={editable}
        {...(editable ? { onIncrement: incrementLineQty, onDecrement: decrementLineQty, onUpdateLine: updateLine, onRemoveLine: removeLine } : {})}
      />
    );

  const busy = saving;
  // Same rule as the invoice list: only issued (sent / part-paid) invoices can be overdue.
  const overdue = !!editInvoice && (status === 'SENT' || status === 'PARTIALLY_PAID') && editInvoice.due < todayIst();

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="More actions" className="w-8 px-0 sm:w-auto sm:px-3">
          <MoreHorizontal size={14} /> <span className="hidden sm:inline">More</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {mode === 'edit' && (
          <DropdownMenuItem className="lg:hidden" onClick={() => setPreviewOpen(true)}>
            <Eye size={14} /> Preview
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
          {gstLocked ? <Lock size={14} /> : <Settings size={14} />} Invoice settings
        </DropdownMenuItem>
        {savedId && (
          <>
            {status !== 'PAID' && (
              <DropdownMenuItem onClick={() => setPaymentOpen(true)}>
                <IndianRupee size={14} /> Record payment
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => shareOnWhatsApp(false)}>
              <MessageCircle size={14} /> Share on WhatsApp
            </DropdownMenuItem>
            {balanceDue > 0.004 && status !== 'DRAFT' && (
              <DropdownMenuItem onClick={() => shareOnWhatsApp(true)}>
                <Clock size={14} /> Send payment reminder
              </DropdownMenuItem>
            )}
            {status !== 'DRAFT' && (
              <DropdownMenuItem onClick={() => router.push(`/credit-notes/new?invoice=${savedId}`)}>
                <FileMinus size={14} /> Credit note / return
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={duplicate}>
              <Copy size={14} /> Duplicate
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem className="text-red focus:text-red" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} /> Delete invoice
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const downloadButton = (
    <Button variant="outline" size="sm" onClick={downloadPdf} disabled={busy} aria-label="Download PDF" className="w-8 px-0 sm:w-auto sm:px-3">
      <Download size={13} /> <span className="hidden sm:inline">Download PDF</span>
    </Button>
  );

  // ---------------------------------------------------------------- PREVIEW
  if (mode === 'preview' && editInvoice) {
    return (
      <div className="mx-auto max-w-[900px] space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
            <ArrowLeft size={13} /> Invoices
          </Button>
          <span className="font-mono text-[14px] font-semibold text-ink">{editInvoice.number}</span>
          <StatusBadge status={status} overdue={overdue} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setMode('edit')}>
              <Pencil size={13} /> Edit
            </Button>
            {downloadButton}
            {moreMenu}
          </div>
        </div>
        {editInvoice.payments.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg2 bg-green-soft px-3.5 py-2.5 text-[12.5px] text-ink-body">
            <CheckCircle2 size={14} className="text-green" />
            {editInvoice.payments.map((p) => (
              <span key={p.id}>
                <b className="font-mono text-ink">{fmtInr(p.amount)}</b> on {p.date}
                {p.mode ? ` by ${p.mode}` : ''}
                {p.receiptNo ? ` · ${p.receiptNo}` : ''}
              </span>
            ))}
          </div>
        )}
        <p className="text-[12px] text-ink-faint">This invoice is paid, so it opens read-only. Edit it if something needs correcting — the status updates from the new total.</p>
        <div className="invoice-sheet-mono rounded-lg2 bg-surface-alt p-3 sm:p-5" style={PAPER_STYLE}>
          <ResponsiveSheetScale>{renderSheet(false)}</ResponsiveSheetScale>
        </div>
        {dialogs()}
      </div>
    );
  }

  function dialogs() {
    return (
      <>
        <StockInSheet
          open={!!stockInFor}
          onOpenChange={(open) => {
            if (open) return;
            setStockInFor(null);
            router.refresh();
          }}
          product={stockProducts.find((p) => p.id === stockInFor) ?? null}
        />
        <ConfirmDialog
          open={forceSaveMode !== null}
          onOpenChange={(open) => !open && setForceSaveMode(null)}
          title="Save with stock below zero?"
          description={
            <>
              {shortages.map((s) => `${s.name} (have ${s.have}, need ${s.need})`).join('; ')} will show negative stock until you add stock or recount it on the
              Inventory screen. Only do this when the goods really are there.
            </>
          }
          confirmLabel="Save anyway"
          onConfirm={() => {
            if (forceSaveMode) save(forceSaveMode, true);
            setForceSaveMode(null);
          }}
        />
        {savedId && editInvoice && (
          <>
            <RecordPaymentDialog
              open={paymentOpen}
              onOpenChange={setPaymentOpen}
              invoiceId={savedId}
              invoiceNumber={editInvoice.number}
              balanceDue={balanceDue}
              customer={customer ? { name: customerDisplayName(customer), phone: customer.phone ?? null } : null}
              onRecorded={() => router.refresh()}
            />
            <DeleteInvoiceDialog
              invoice={{ id: savedId, number: editInvoice.number, status, irn: editInvoice.irn, customer: customer ? customerDisplayName(customer) : null }}
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              onDeleted={() => router.push('/invoices')}
            />
          </>
        )}
        {settingsSheet()}
      </>
    );
  }

  function settingsSheet() {
    return (
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
              <SettingsToggleRow label="Bank details" checked={draftSettings.showBankDetails} disabled={gstLocked} onChange={(v) => setDraftSettings((s) => ({ ...s, showBankDetails: v }))} />
              {isGst && (
                <SettingsToggleRow label="HSN-wise tax summary" checked={draftSettings.showHsnSummary} disabled={gstLocked} onChange={(v) => setDraftSettings((s) => ({ ...s, showHsnSummary: v }))} />
              )}
            </SettingsSection>
            <SettingsSection icon={QrCode} title="Payment info">
              <SettingsToggleRow label="UPI QR" checked={draftSettings.showUpiQr} disabled={gstLocked} onChange={(v) => setDraftSettings((s) => ({ ...s, showUpiQr: v }))} />
              <SettingsToggleRow label="GPay number" checked={draftSettings.showGpayNumber} disabled={gstLocked} onChange={(v) => setDraftSettings((s) => ({ ...s, showGpayNumber: v }))} />
              {!company.upi && !company.phone && (
                <p className="flex items-start gap-1.5 pt-1 text-[11px] text-ink-faint">
                  <Info size={11} className="mt-0.5 flex-shrink-0" /> Add a UPI ID or phone number in Company settings first — there&apos;s nothing to show yet.
                </p>
              )}
            </SettingsSection>
            {isGst && (
              <SettingsSection icon={Truck} title="Transport details">
                <SettingsToggleRow label="Show on invoice PDF" checked={showTransportDetails} onChange={setShowTransportDetails} />
                {showTransportDetails && (
                  <div className="space-y-2 bg-surface px-3 py-2.5">
                    <input value={transportVehicleNo} onChange={(e) => setTransportVehicleNo(e.target.value)} placeholder="Vehicle number" className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none" />
                    <input value={transportDriverName} onChange={(e) => setTransportDriverName(e.target.value)} placeholder="Driver name" className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none" />
                    <input value={transportDriverPhone} onChange={(e) => setTransportDriverPhone(e.target.value)} placeholder="Driver contact number" className="w-full rounded-sm2 border border-line bg-bg px-2.5 py-1.5 text-[12px] focus:border-brand focus:outline-none" />
                    <p className="flex items-start gap-1.5 text-[11px] text-ink-faint">
                      <Info size={11} className="mt-0.5 flex-shrink-0" /> Prints in a box before Delivery Instructions — blank fields don&apos;t show. The vehicle number also groups the daily loading sheet.
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
    );
  }

  const primarySave: { mode: SaveMode; label: string } = !savedId || status === 'DRAFT' ? { mode: 'send', label: 'Save & send' } : { mode: 'keep', label: 'Save' };

  // ------------------------------------------------------------------- EDIT
  return (
    <>
      {/* `invoice-builder-root` opts this page out of the app shell's
          max-w-[1220px] centering (see globals.css). On large screens the
          builder fills exactly the viewport below the top bar, and each
          column scrolls on its own — so the customer and catalog stay in
          reach while you scroll the invoice, and vice versa. */}
      <div className="invoice-builder-root flex flex-col lg:h-[calc(100dvh-101px)]">
        <div className="mb-3 flex flex-none flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/invoices')}>
              <ArrowLeft size={13} /> Invoices
            </Button>
            <span className="font-mono text-[13px] font-semibold text-ink-soft">{editInvoice ? editInvoice.number : 'New invoice'}</span>
            {editInvoice ? <StatusBadge status={status} overdue={overdue} /> : <span className="rounded-sm2 bg-surface-alt px-2.5 py-1 text-[11px] font-bold text-ink-soft">Not saved yet</span>}
            {status === 'PAID' && (
              <Button variant="ghost" size="sm" onClick={() => setMode('preview')}>
                <Eye size={13} /> Preview
              </Button>
            )}
          </div>
          {/* Side by side on a phone too — each field shrinks to half the row. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <div className="flex min-w-0 items-center gap-1.5 rounded-sm2 border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-soft sm:px-3">
              <Clock size={12} className="hidden flex-shrink-0 sm:block" /> Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full min-w-0 border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none sm:w-auto" />
            </div>
            <div className="flex min-w-0 items-center gap-1.5 rounded-sm2 border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-soft sm:px-3">
              <Clock size={12} className="hidden flex-shrink-0 sm:block" /> Due
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full min-w-0 border-none bg-transparent font-mono text-[11.5px] text-ink-body outline-none sm:w-auto" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pb-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[40fr_60fr] lg:pb-0">
          {/* LEFT — every input control. Scrolls independently on lg+. */}
          <div className="flex flex-col gap-2.5 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-3 lg:pr-1">
            {isGst && <InvoiceCompletenessChecklist items={checklistItems} compact />}

            {editInvoice && (editInvoice.einvoiceStatus === 'FAILED' || editInvoice.ewaybillStatus === 'FAILED') && (
              <div className="space-y-1.5">
                {editInvoice.einvoiceStatus === 'FAILED' && editInvoice.einvoiceError && (
                  <p className="rounded-lg2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] font-semibold text-destructive">e-Invoice failed: {editInvoice.einvoiceError}</p>
                )}
                {editInvoice.ewaybillStatus === 'FAILED' && editInvoice.ewbError && (
                  <p className="rounded-lg2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11.5px] font-semibold text-destructive">e-Way Bill failed: {editInvoice.ewbError}</p>
                )}
              </div>
            )}

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
                  defaultState={company.state}
                  onCreated={(c) => {
                    setCustomer(c);
                    setShowQuickAdd(false);
                    queryClient.invalidateQueries({ queryKey: ['customers', 'billing'] });
                  }}
                  onCancel={() => setShowQuickAdd(false)}
                />
              ) : (
                <div>
                  <div className="flex items-center gap-2 rounded-sm2 border border-line bg-surface px-2.5 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
                    <Search size={12} className="flex-shrink-0 text-ink-faint" />
                    <input
                      value={custQuery}
                      onChange={(e) => setCustQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setCustCursor((c) => Math.min(c + 1, customerMatches.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setCustCursor((c) => Math.max(c - 1, 0));
                        } else if (e.key === 'Enter' && customerMatches[custCursor]) {
                          e.preventDefault();
                          setCustomer(customerMatches[custCursor]);
                        }
                      }}
                      placeholder="Name, shop or mobile number…"
                      autoComplete="off"
                      aria-label="Search customers"
                      className="w-full bg-transparent text-[12px] outline-none"
                    />
                  </div>
                  <div className="mt-1.5 overflow-hidden rounded-lg2 border border-line bg-surface shadow-elevated">
                    <div className="flex items-center justify-between border-b border-line px-2.5 py-1 text-[10.5px] text-ink-faint">
                      <span>{custQuery.trim() ? `${customerMatches.length} of ${directorySize} customers` : `${directorySize} customers`}</span>
                      <span className="hidden sm:inline">↑ ↓ to move · Enter to pick</span>
                    </div>
                    <div className="max-h-[min(55vh,420px)] overflow-y-auto [scrollbar-width:auto]">
                      {customersQuery.isLoading ? (
                        <div className="space-y-1.5 p-2">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2.5 px-1 py-1.5">
                              <Skeleton className="h-[26px] w-[26px] flex-shrink-0 rounded-sm2" />
                              <Skeleton className="h-3 flex-1" />
                            </div>
                          ))}
                        </div>
                      ) : customerMatches.length === 0 ? (
                        <p className="px-3 py-4 text-center text-[11.5px] text-ink-faint">{custQuery.trim() ? 'No customer matches that.' : 'No customers yet.'}</p>
                      ) : (
                        customerMatches.map((c, i) => (
                          <button
                            key={c.id}
                            onClick={() => setCustomer(c)}
                            onMouseEnter={() => setCustCursor(i)}
                            className={`flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left last:border-0 ${i === custCursor ? 'bg-brand-light' : 'hover:bg-brand-light'}`}
                          >
                            <span className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-sm2 text-[10.5px] font-extrabold text-white" style={{ background: hashColor(customerDisplayName(c)) }}>
                              {initials(customerDisplayName(c))}
                            </span>
                            <span className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-bold text-ink">
                                {customerDisplayName(c)}
                                {c.guest && <span className="ml-1.5 rounded-sm2 bg-surface-alt px-1.5 py-0.5 text-[9px] font-bold text-ink-faint">Guest</span>}
                              </div>
                              <div className="truncate text-[10.5px] text-ink-faint">{[c.shopName ? c.name : null, c.phone, c.state].filter(Boolean).join(' · ')}</div>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                    <button onClick={() => setShowQuickAdd(true)} className="flex w-full items-center gap-1.5 border-t border-line px-2.5 py-2 text-left text-[11.5px] font-bold text-brand hover:bg-brand-light">
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
                        <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" /> Already owes {fmtInr(outstandingElsewhere)} on other invoices
                      </div>
                    )
                  )}
                  {specialPrices.size > 0 && (
                    <div className="mt-1 flex items-center gap-1.5 text-[10.5px] font-bold text-brand-dark">
                      <Tag size={10} /> {specialPrices.size} special price{specialPrices.size === 1 ? '' : 's'} apply to this customer
                    </div>
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
                onSaved={(c) => {
                  setCustomer({ ...c, phone: c.phone ?? null, guest: c.guest ?? false });
                  queryClient.invalidateQueries({ queryKey: ['customers', 'billing'] });
                }}
              />
            )}

            {customer && lines.length === 0 && lastOrderDismissedFor !== customer.id && (
              <LastOrderCard
                key={customer.id}
                customerId={customer.id}
                excludeInvoiceId={savedId ?? undefined}
                onRepeat={repeatOrder}
                onDismiss={() => setLastOrderDismissedFor(customer.id)}
              />
            )}

            {blocked && (
              <ShortagePanel
                shortages={shortages}
                isOwner={isOwner}
                busy={busy}
                onSetQty={(lineId, qty) => updateLine(lineId, { qty })}
                onRemoveLine={removeLine}
                onAddStock={setStockInFor}
                onSaveAnyway={() => setForceSaveMode(primarySave.mode)}
              />
            )}
            {belowCost.length > 0 && <BelowCostPanel lines={belowCost} />}

            <DiscountCard
              hasItems={hasItems}
              itemCount={lines.filter((l) => !l.free).length}
              setAllPct={setAllPct}
              onSetAllPctChange={setSetAllPct}
              onApplyAll={applyDiscountToAll}
              discountType={discountType}
              onDiscountTypeChange={(t) => {
                setDiscountType(t);
                if (t === 'PERCENT') setDiscountValue((v) => Math.min(v, 100));
              }}
              discountValue={discountValue}
              onDiscountValueChange={changeBillDiscount}
              gross={grossAmount}
              itemDiscount={lineDiscountTotal}
              billDiscount={totals.overallDiscountAmount}
              totals={totals}
              hiddenOnPdf={[!company.pdfShowItemDiscount && 'item', !company.pdfShowBillDiscount && 'bill'].filter((x): x is string => !!x)}
            />

            {offers.length > 0 && (
              <div className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
                  <Gift size={11} className="text-brand" /> Offers on this invoice
                </div>
                {offers.map((o) => (
                  <div key={o.scheme.id} className="flex items-center gap-2 py-1 text-[11.5px]">
                    <span className="min-w-0 flex-1 truncate">
                      <b className="text-ink">{o.scheme.name || `Buy ${o.scheme.buyQty} get ${o.scheme.freeQty} free`}</b> · {o.line.name}
                    </span>
                    {o.given === o.eligible ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-green">
                        <Check size={11} /> {o.eligible} free added
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => applyOffer(o)}>
                        <Plus size={11} /> Add {o.eligible} free {formatUnit(o.scheme.unit)}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div data-tour="add-products" className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
                <Package size={11} className="text-brand" /> Add products
              </div>
              <div className="flex items-center gap-2 rounded-sm2 border border-line bg-bg px-2.5 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-light">
                <Search size={12} className="flex-shrink-0 text-ink-faint" />
                <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search catalog to add…" autoComplete="off" aria-label="Search catalog" className="w-full bg-transparent text-[12px] outline-none" />
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
                        remaining={remainingFor(p)}
                        specialPrices={specialPrices}
                        onAddTier={(tier) => addProductTier(p, tier)}
                        onDecrementTier={(unit) => decrementProductTier(p.id, unit)}
                      />
                    ))}
                    <div className="mt-1 border-t border-line px-1.5 pb-0.5 pt-1.5 text-[10px] text-ink-faint">All products</div>
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
                      remaining={remainingFor(p)}
                      specialPrices={specialPrices}
                      onAddTier={(tier) => addProductTier(p, tier)}
                      onDecrementTier={(unit) => decrementProductTier(p.id, unit)}
                    />
                  ))
                )}
              </div>
              {listProducts.length > PRODUCTS_PER_PAGE && (
                <Pagination page={productPage} pageSize={PRODUCTS_PER_PAGE} total={listProducts.length} onPageChange={setProductPage} className="border-t-0 px-0 py-1.5" />
              )}
              <div data-tour="custom-item">
                {showCustomItemForm ? (
                  <AddCustomItemForm onAdd={addCustomLine} onCancel={() => setShowCustomItemForm(false)} />
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

            {editInvoice && editInvoice.payments.length > 0 && (
              <div className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
                <div className="mb-1.5 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
                    <ReceiptText size={11} className="text-brand" /> Payments
                  </span>
                  <span className="text-[11px] text-ink-soft">
                    Paid <b className="font-mono text-ink">{fmtInr(editInvoice.amountPaid)}</b>
                    {balanceDue > 0.004 && (
                      <>
                        {' '}
                        · due <b className="font-mono text-red">{fmtInr(balanceDue)}</b>
                      </>
                    )}
                  </span>
                </div>
                {editInvoice.payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 border-t border-line py-1.5 text-[11.5px] first:border-0">
                    <span className="font-mono text-ink">{fmtInr(p.amount)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-faint">
                      {p.date}
                      {p.mode ? ` · ${p.mode}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                      {p.receiptNo ? ` · ${p.receiptNo}` : ''}
                    </span>
                    {p.creditNoteId ? (
                      <Link href={`/credit-notes/${p.creditNoteId}`} className="text-[10.5px] font-bold text-brand hover:underline">
                        View
                      </Link>
                    ) : (
                      <PdfDownloadButton
                        iconOnly
                        variant="ghost"
                        href={`/api/pdf/receipts/${p.id}`}
                        fileName={pdfFileName(p.receiptNo ?? `Receipt-${editInvoice.number}`)}
                        label="Download receipt"
                      />
                    )}
                    {!p.creditNoteId && isOwner && (
                      <button
                        aria-label="Delete payment"
                        className="rounded-sm2 p-1 text-ink-faint hover:bg-red-soft hover:text-red"
                        onClick={() =>
                          deletePayment.mutate(p.id, {
                            onSuccess: () => {
                              toast.success('Payment removed');
                              router.refresh();
                            },
                            onError: (e: any) => toast.error(e?.message ?? 'Could not remove the payment'),
                          })
                        }
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {status !== 'PAID' && (
                  <Button size="sm" variant="outline" className="mt-1.5 w-full justify-center" onClick={() => setPaymentOpen(true)}>
                    <IndianRupee size={12} /> Record payment
                  </Button>
                )}
              </div>
            )}

            {savedId && isGst && editInvoice && (
              <div className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
                  <ShieldCheck size={11} className="text-brand" /> GST filing
                </div>
                <div className="flex flex-wrap gap-2">
                  <GenerateEinvoiceButton invoiceId={savedId} hasCredentials={!!company.nicUsername} status={editInvoice.einvoiceStatus} />
                  <GenerateEwaybillButton invoiceId={savedId} hasCredentials={!!company.nicUsername} status={editInvoice.ewaybillStatus} defaults={editInvoice.transport} />
                </div>
                {dirty && <p className="mt-1.5 text-[10.5px] text-ink-faint">Save your changes before filing — the portal gets the saved invoice.</p>}
              </div>
            )}

            {savedId && (
              <details className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
                  <Clock size={11} className="text-brand" /> History
                </summary>
                <div className="mt-2">
                  <InvoiceHistory invoiceId={savedId} />
                </div>
              </details>
            )}
          </div>

          {/* RIGHT — the live invoice, exactly as the PDF prints it. Scrolls
              independently on lg+. */}
          <div data-tour="invoice-sheet" className="invoice-sheet-mono relative lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain" style={PAPER_STYLE}>
            <div className="sticky top-0 z-10 h-[5px] rounded-t-lg2 bg-brand" />
            <ResponsiveSheetScale>{renderSheet(true)}</ResponsiveSheetScale>
          </div>
        </div>

        {/* One footer row: running total (or the current error) on the left,
            actions on the right. Last flex row on desktop; pinned above the
            mobile bottom navigation on phones, where the secondary actions
            shrink to icons so everything fits on one row. */}
        <div
          data-tour="save-buttons"
          className="sticky bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 -mx-4 flex flex-none flex-wrap items-center gap-2 border-t border-line bg-surface px-3 py-2 shadow-elevated sm:gap-2.5 sm:px-4 sm:py-3 md:bottom-0 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:rounded-b-lg2 lg:shadow-none"
        >
          <div className="mr-auto flex min-w-0 flex-1 items-center">
            {error ? (
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold leading-snug text-destructive sm:text-[12px]">
                <AlertTriangle size={12} className="flex-shrink-0" /> {error}
              </p>
            ) : hasItems ? (
              <div className="flex min-w-0 items-center gap-2 text-[11.5px] font-semibold leading-tight text-ink-soft sm:text-[12px]">
                <span className="hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-sm2 bg-brand-light text-brand-dark sm:flex">
                  <ShoppingCart size={13} />
                </span>
                <span className="min-w-0">
                  <b className="font-mono text-ink">{lines.length}</b> item{lines.length !== 1 ? 's' : ''}
                  <span className="hidden sm:inline">
                    {' '}
                    · <b className="font-mono text-ink">{Math.round(totalUnits * 100) / 100}</b> unit{totalUnits !== 1 ? 's' : ''}
                  </span>{' '}
                  · <b className="font-mono text-ink">{fmtInr(totals.total)}</b>
                  {dirty && savedId && (
                    <>
                      <span className="ml-2 hidden text-[11px] font-normal text-gold sm:inline">Unsaved changes</span>
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle sm:hidden" title="Unsaved changes" />
                    </>
                  )}
                </span>
              </div>
            ) : (
              <p className="hidden items-center gap-1.5 text-[10.5px] text-ink-faint sm:flex">
                <Info size={11} className="flex-shrink-0" /> The invoice number is assigned the moment you save.
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Phones reach Preview from More — the row stays one line. */}
            <Button variant="secondary" size="sm" className="hidden sm:inline-flex lg:hidden" onClick={() => setPreviewOpen(true)}>
              <Eye size={13} /> Preview
            </Button>
            {downloadButton}
            {moreMenu}
            <div className="flex">
              <Button
                className="h-8 rounded-r-none px-3 text-[12.5px] sm:h-9 sm:px-4 sm:text-[13px]"
                onClick={() => save(primarySave.mode)}
                disabled={busy || blocked}
                title={blocked ? 'Not enough stock — reduce quantities or add stock' : undefined}
              >
                <CheckCircle2 size={13} /> {saving ? 'Saving…' : primarySave.label}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-8 rounded-l-none border-l border-white/30 px-1.5 sm:h-9 sm:px-2" aria-label="More save options" disabled={busy}>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[230px]">
                  {primarySave.mode !== 'send' && status === 'DRAFT' && (
                    <DropdownMenuItem onClick={() => save('send')} disabled={blocked}>
                      <CheckCircle2 size={14} /> Save &amp; send
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => save('draft')} disabled={blocked}>
                    <FileText size={14} /> {savedId && status !== 'DRAFT' ? 'Move back to draft' : 'Save as draft'}
                  </DropdownMenuItem>
                  {status !== 'PAID' && (
                    <DropdownMenuItem onClick={() => save('paid')} disabled={blocked}>
                      <IndianRupee size={14} /> Save &amp; mark paid
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[720px]" mobileFullScreen>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye size={16} className="text-brand" /> Invoice preview
            </DialogTitle>
          </DialogHeader>
          <div className="invoice-sheet-mono max-h-[70vh] overflow-y-auto" style={PAPER_STYLE}>
            <ResponsiveSheetScale>{renderSheet(false)}</ResponsiveSheetScale>
          </div>
        </DialogContent>
      </Dialog>

      {dialogs()}
    </>
  );
}

/** Discounts, in the order they apply: every line's own Disc % (with a
 * one-shot "set every item to __%"), then an optional bill-level discount,
 * with the running ladder underneath so the effect of each is visible. */
function DiscountCard({
  hasItems,
  itemCount,
  setAllPct,
  onSetAllPctChange,
  onApplyAll,
  discountType,
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  gross,
  itemDiscount,
  billDiscount,
  totals,
  hiddenOnPdf,
}: {
  hasItems: boolean;
  itemCount: number;
  setAllPct: string;
  onSetAllPctChange: (v: string) => void;
  onApplyAll: () => void;
  discountType: 'PERCENT' | 'FLAT';
  onDiscountTypeChange: (t: 'PERCENT' | 'FLAT') => void;
  discountValue: number;
  onDiscountValueChange: (v: string) => void;
  gross: number;
  itemDiscount: number;
  billDiscount: number;
  totals: { taxable: number; cgst: number; sgst: number; igst: number; useIgst: boolean; total: number };
  /** Which discounts Company settings keep off the PDF ('item', 'bill'). */
  hiddenOnPdf: string[];
}) {
  return (
    <div className="rounded-xl2 border border-line bg-surface p-2.5 shadow-card">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-faint">
        <Percent size={11} className="text-brand" /> Discount
      </div>
      {hiddenOnPdf.length > 0 && (
        <p className="mb-2 rounded-sm2 bg-surface-alt px-2 py-1.5 text-[10.5px] leading-snug text-ink-soft">
          {hiddenOnPdf.length === 2 ? 'Item and bill discounts are' : hiddenOnPdf[0] === 'item' ? 'Item discounts are' : 'The bill discount is'} hidden on the PDF — still taken off the
          total, printed inside the rates.{' '}
          <Link href="/company#invoice" className="font-bold text-brand">
            Change
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-[11px] font-semibold text-ink-soft">
          Set every item to
          <span className="mt-1 flex w-28 items-center overflow-hidden rounded-sm2 border border-line bg-bg focus-within:border-brand">
            <input
              type="number"
              min={0}
              max={100}
              value={setAllPct}
              onChange={(e) => onSetAllPctChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onApplyAll()}
              placeholder="0"
              aria-label="Discount percent for every item"
              className="w-full bg-transparent px-2 py-1.5 text-right font-mono text-[12px] outline-none"
            />
            <span className="border-l border-line bg-surface-alt px-2 py-1.5 text-[11px] text-ink-faint">%</span>
          </span>
        </label>
        <Button size="sm" variant="outline" onClick={onApplyAll} disabled={!hasItems && !setAllPct}>
          Apply to {itemCount || 'all'} item{itemCount === 1 ? '' : 's'}
        </Button>
      </div>
      <p className="mt-1 text-[10.5px] text-ink-faint">One-time — each item&apos;s Disc % stays editable on the invoice, and new items start at this %.</p>

      <div className="mt-2.5 text-[11px] font-semibold text-ink-soft">Extra discount on bill total</div>
      <div className="mt-1 flex items-center gap-1.5">
        <div className="flex overflow-hidden rounded-sm2 border border-line">
          {(['PERCENT', 'FLAT'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onDiscountTypeChange(t)}
              aria-pressed={discountType === t}
              className={`px-2.5 py-1.5 text-[11.5px] font-bold ${discountType === t ? 'bg-chrome text-white' : 'bg-surface text-ink-soft'}`}
            >
              {t === 'PERCENT' ? '%' : '₹'}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={discountType === 'PERCENT' ? 100 : undefined}
          value={discountValue || ''}
          onChange={(e) => onDiscountValueChange(e.target.value)}
          placeholder="0"
          aria-label="Bill discount"
          className="w-28 rounded-sm2 border border-line bg-bg px-2 py-1.5 text-right font-mono text-[12px] outline-none focus:border-brand"
        />
      </div>
      <p className="mt-1 text-[10.5px] text-ink-faint">Taken off after item discounts{discountType === 'PERCENT' ? ' · up to 100%' : ' · up to the subtotal'}.</p>

      {hasItems && (
        <dl className="mt-2.5 space-y-0.5 border-t border-dashed border-line pt-2 text-[11.5px]">
          <LadderRow label="Gross (qty × rate)" value={fmtInr(gross)} />
          {itemDiscount > 0.004 && <LadderRow label="Item discount" value={`−${fmtInr(itemDiscount)}`} accent />}
          {billDiscount > 0.004 && <LadderRow label="Bill discount" value={`−${fmtInr(billDiscount)}`} accent />}
          <LadderRow label="Taxable value" value={fmtInr(totals.taxable)} />
          {totals.useIgst ? totals.igst > 0 && <LadderRow label="IGST" value={fmtInr(totals.igst)} /> : totals.cgst + totals.sgst > 0 && <LadderRow label="CGST + SGST" value={fmtInr(totals.cgst + totals.sgst)} />}
          <LadderRow label="Total" value={fmtInr(totals.total)} strong />
          {itemDiscount + billDiscount > 0.004 && <LadderRow label="Customer saves" value={fmtInr(itemDiscount + billDiscount)} accent />}
        </dl>
      )}
    </div>
  );
}

function LadderRow({ label, value, accent, strong }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'border-t border-line pt-1 text-[12.5px] font-bold text-ink' : 'text-ink-soft'}`}>
      <dt>{label}</dt>
      <dd className={`font-mono ${accent ? 'text-green' : strong ? 'text-ink' : 'text-ink-body'}`}>{value}</dd>
    </div>
  );
}

/** Lazy-loaded per-invoice activity trail (who created, edited, paid…). */
function InvoiceHistory({ invoiceId }: { invoiceId: string }) {
  return <ActivityTimeline entityType="invoice" entityId={invoiceId} />;
}

/** Controlled variant of company-profile.tsx's RateRow — that one is built for
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
  remaining,
  specialPrices,
  onAddTier,
  onDecrementTier,
}: {
  product: Product;
  lines: Line[];
  /** Main-unit stock this invoice can still use; null = not tracked. */
  remaining: number | null;
  specialPrices: Map<string, number>;
  onAddTier: (tier: PriceTier) => void;
  onDecrementTier: (unit: string) => void;
}) {
  const tiers = tiersFor(product);
  const single = tiers.length === 1;
  const qtyFor = (unit: string) => lines.find((l) => !l.free && l.productId === product.id && l.unit === unit)?.qty ?? 0;
  // One more of this unit must fit in what's left (1 Box needs a whole box;
  // 1 Piece only 1/12 of one).
  const canAdd = (unit: string) => remaining == null || remaining + 1e-6 >= unitFactor(product, unit);
  const specialFor = (unit: string) => specialPrices.get(`${product.id}|${unit.trim().toLowerCase()}`);
  const active = tiers.some((t) => qtyFor(t.unit) > 0);
  // e.g. "₹20.00/Piece · ₹450.00/Box (≈₹11.25/Piece)" — the per-piece figure
  // is price ÷ approxQty, purely a comparison aid; approxQty is never a
  // purchase minimum, see ProductPriceTier.approxQty.
  const tierSummary = tiers
    .map((t) => {
      const price = specialFor(t.unit) ?? Number(t.price);
      const approxQty = t.approxQty != null ? Number(t.approxQty) : 0;
      const perPiece = approxQty > 0 ? price / approxQty : null;
      return `${fmtInr(price)}/${formatUnit(t.unit)}${perPiece != null ? ` (≈${fmtInr(perPiece)}/Piece)` : ''}`;
    })
    .join(' · ') + (Number(product.discount) > 0 ? ` · ${Number(product.discount)}% off` : '');
  return (
    <div className={`flex items-start gap-2 rounded-lg2 px-1.5 py-1.5 transition-colors hover:bg-bg ${active ? 'bg-brand-light' : ''}`}>
      <span className={`mt-0.5 flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-sm2 ${categoryTile(product.category)}`}>
        <CategoryIcon category={product.category} size={12} />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="truncate text-[11.5px] font-bold text-ink">{product.name}</div>
        <div className="truncate text-[10px] text-ink-faint">{tierSummary}</div>
        {(remaining != null || tiers.some((t) => specialFor(t.unit) != null)) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {remaining != null && (
              <span
                className={`rounded-sm2 px-1.5 py-px text-[9.5px] font-bold ${
                  remaining <= 1e-6 ? 'bg-red-soft text-red' : product.lowStockAt != null && remaining <= Number(product.lowStockAt) ? 'bg-gold-soft text-gold' : 'bg-green-soft text-green'
                }`}
              >
                {remaining <= 1e-6 ? 'Out of stock' : `${formatStock(remaining, product)} left`}
              </span>
            )}
            {tiers.some((t) => specialFor(t.unit) != null) && <span className="rounded-sm2 bg-brand-light px-1.5 py-px text-[9.5px] font-bold text-brand-dark">Special price</span>}
          </div>
        )}
      </div>
      {/* A product with exactly one pricing tier keeps one compact counter
          here. Two or more tiers (e.g. Box + Piece + Kg) stack vertically
          on the right instead, each tinted its own accent color, so each
          unit's control stays visually distinct without eating horizontal
          width the way an equal-column grid underneath used to. */}
      {single ? (
        <QtyCounter qty={qtyFor(tiers[0].unit)} canAdd={canAdd(tiers[0].unit)} onAdd={() => onAddTier(tiers[0])} onDecrement={() => onDecrementTier(tiers[0].unit)} name={product.name} />
      ) : (
        <div className="flex flex-shrink-0 flex-col gap-1">
          {tiers.map((t, i) => (
            <TierCounterRow
              key={t.id ?? `${t.unit}-${i}`}
              accent={TIER_ACCENTS[i % TIER_ACCENTS.length]}
              caption={formatUnit(t.unit)}
              qty={qtyFor(t.unit)}
              canAdd={canAdd(t.unit)}
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
function QtyCounter({ qty, canAdd = true, onAdd, onDecrement, name }: { qty: number; canAdd?: boolean; onAdd: () => void; onDecrement: () => void; name: string }) {
  if (qty > 0) {
    return (
      <div className="flex flex-shrink-0 items-center gap-1.5 rounded-sm2 border-[1.5px] border-brand bg-surface p-0.5">
        <button onClick={onDecrement} aria-label={`Decrease ${name} quantity`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 bg-brand-light text-brand-dark">
          <Minus size={10} />
        </button>
        <span key={qty} className="min-w-[18px] animate-bump text-center font-mono text-[11.5px] font-extrabold">
          {qty}
        </span>
        <button onClick={onAdd} disabled={!canAdd} aria-label={`Increase ${name} quantity`} className="flex h-[20px] w-[20px] items-center justify-center rounded-sm2 bg-brand-light text-brand-dark disabled:opacity-40">
          <Plus size={10} />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onAdd}
      disabled={!canAdd}
      title={canAdd ? undefined : 'Out of stock'}
      className="flex flex-shrink-0 items-center gap-1 rounded-sm2 bg-brand px-2.5 py-1 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-faint"
    >
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
  canAdd = true,
  onAdd,
  onDecrement,
  name,
}: {
  accent: string;
  caption: string;
  qty: number;
  canAdd?: boolean;
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
          <button onClick={onAdd} disabled={!canAdd} aria-label={`Increase ${name} quantity`} className="flex h-[16px] w-[16px] items-center justify-center rounded-sm2 text-ink-soft hover:bg-surface-alt disabled:opacity-40">
            <Plus size={9} />
          </button>
        </div>
      ) : (
        <button
          onClick={onAdd}
          disabled={!canAdd}
          aria-label={`Add ${name}`}
          className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-sm2 bg-brand text-white disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-faint"
        >
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
      let result: { id?: string; error?: string };
      try {
        result = await createProduct.mutateAsync(formData);
      } catch (err: any) {
        result = { error: err?.message ?? 'Could not save the product' };
      }
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

function QuickAddCustomer({ query, defaultState, onCreated, onCancel }: { query: string; defaultState: string; onCreated: (c: Customer) => void; onCancel: () => void }) {
  const looksLikePhone = /^[\d\s+()-]{5,}$/.test(query.trim());
  const createCustomer = useCreateCustomer();
  const [error, setError] = useState<string | undefined>();
  const [quickAddState, setQuickAddState] = useState(defaultState);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const guest = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('data-guest') === 'true';
    let result: { id?: string; error?: string };
    try {
      result = await createCustomer.mutateAsync({ guest, formData });
    } catch (err: any) {
      result = { error: err?.message ?? 'Could not save the customer' };
    }
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
