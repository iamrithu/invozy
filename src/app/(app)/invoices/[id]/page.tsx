import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals } from '@/lib/gst';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceEwayBillSheet } from '@/components/invoices/invoice-eway-bill-sheet';
import { qrDataUrl, upiQrDataUrl } from '@/lib/qr';
import { PrintButton } from './print-button';
import { DownloadPdfButton } from '@/components/invoices/download-pdf-button';
import { GenerateEinvoiceButton } from './generate-einvoice-button';
import { GenerateEwaybillButton } from './generate-ewaybill-button';
import { InvoiceCompletenessChecklist } from '@/components/invoices/invoice-completeness-checklist';
import { InlinePdfPreview } from './inline-pdf-preview';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pdfRender?: string }> }) {
  const { id } = await params;
  // Set only by the PDF-generation route's own internal navigation (see
  // src/app/api/invoices/[id]/pdf/route.ts) — InlinePdfPreview fetches that
  // same route to render inline, so it must not mount while Playwright is
  // rendering *this* page for that route, or every PDF request would
  // recursively spawn another one from inside itself.
  const { pdfRender } = await searchParams;
  const isPdfRender = pdfRender === '1';
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: { select: { packQty: true } } } }, payments: true },
    }),
    getCompany(),
  ]);
  // Without this, any logged-in user from any company could view another
  // company's invoice just by knowing/guessing its id — this page never
  // otherwise checks tenant ownership (unlike the PDF download route, which
  // already does).
  if (!invoice || invoice.companyId !== company.id) notFound();

  const lines = invoice.items.map((it) => ({
    lineId: it.id,
    productId: it.productId,
    name: it.name,
    unit: it.unit,
    qty: Number(it.qty),
    rate: Number(it.rate),
    discount: Number(it.discount),
    // The product's current pack size, best-effort — not snapshotted at
    // invoice time, so it can drift if edited later (same as elsewhere in
    // the app, this is always an approximate display hint, never billed on).
    packQty: it.product?.packQty ?? null,
    hsn: it.hsn,
    batch: it.batch,
    altUnit: it.altUnit,
    altQtyPerUnit: it.altQtyPerUnit ? Number(it.altQtyPerUnit) : null,
  }));

  // Plain, serializable subset of the Prisma Customer row — InvoiceSheet/
  // InvoiceSheetClassic are Client Components (they measure real section
  // heights for pagination, which needs a real browser), so every prop
  // reaching them from this Server Component has to be a plain
  // serializable value. `invoice.customer` as-is carries a Prisma
  // `Decimal` (creditLimit) which isn't — Next.js rejects that at the
  // server/client boundary with "Only plain objects can be passed to
  // Client Components", so only the fields these components actually use
  // are picked here.
  const customer = {
    name: invoice.customer.name,
    shopName: invoice.customer.shopName,
    address: invoice.customer.address,
    state: invoice.customer.state,
    gstin: invoice.customer.gstin,
    fssaiNo: invoice.customer.fssaiNo,
    pincode: invoice.customer.pincode,
    contact: invoice.customer.contact,
    phone: invoice.customer.phone,
    altPhone: invoice.customer.altPhone,
  };

  const isClassic = company.invoiceTemplate === 'CLASSIC';
  const qrImageDataUrl = isClassic && invoice.signedQrCode ? await qrDataUrl(invoice.signedQrCode) : null;
  // Reads the invoice's own frozen snapshot, not the live Company toggle —
  // see schema.prisma's comment on Invoice.showUpiQr/showGpayNumber.
  const upiQrImageDataUrl = invoice.showUpiQr ? await upiQrDataUrl(company.upi, company.name) : null;
  const gpayNumber = invoice.showGpayNumber ? company.phone || company.altPhone : null;

  // Reads the invoice's own frozen snapshot, never live Company data — see
  // schema.prisma's comment on Invoice.cgstRate/etc. for why: this is what
  // keeps an already-issued invoice's totals immune to a later change in
  // Company GST settings.
  const totals = computeTotals(
    lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) },
    {
      cgstRate: Number(invoice.cgstRate),
      sgstRate: Number(invoice.sgstRate),
      igstRate: Number(invoice.igstRate),
      cgstEnabled: invoice.cgstEnabled,
      sgstEnabled: invoice.sgstEnabled,
      igstEnabled: invoice.igstEnabled,
    },
    company.state,
    invoice.customer.state
  );
  const lineDiscountTotal = lines.reduce((s, l) => s + l.qty * l.rate * (l.discount / 100), 0);
  const totalSavings = lineDiscountTotal + totals.overallDiscountAmount;
  const amountPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);

  const hsnGoods: { hsn: string; description: string; qty: string; taxableValue: number }[] = [];
  if (isClassic) {
    const groups = new Map<string, { qty: number; unit: string; taxableValue: number; names: Set<string> }>();
    for (const l of lines) {
      const hsn = l.hsn?.trim() || '—';
      const g = groups.get(hsn) ?? { qty: 0, unit: l.unit, taxableValue: 0, names: new Set<string>() };
      g.qty += l.qty;
      g.taxableValue += l.qty * l.rate * (1 - l.discount / 100);
      g.names.add(l.name);
      groups.set(hsn, g);
    }
    for (const [hsn, g] of groups) hsnGoods.push({ hsn, description: Array.from(g.names).join(' & '), qty: `${g.qty} ${g.unit}`, taxableValue: g.taxableValue });
  }
  const gstRateLabel = totals.useIgst ? `${Number(invoice.igstRate)}%` : `${Number(invoice.cgstRate)}+${Number(invoice.sgstRate)}`;

  const checklistItems = [
    { label: 'Company GSTIN', done: !!company.gstin, href: '/company' },
    { label: 'Company PAN', done: !!company.pan, href: '/company' },
    { label: 'Company FSSAI license no.', done: !!company.fssaiNo, href: '/company' },
    { label: 'Company logo', done: !!company.logoUrl, href: '/company' },
    { label: 'Bank details', done: !!(company.bankName && company.bankAcc && company.ifsc), href: '/company' },
    { label: 'Terms', done: !!company.terms, href: '/company' },
    { label: 'Authorised signatory (name or e-signature)', done: !!(company.signatoryName || company.signatureUrl), href: '/company' },
    { label: `${invoice.customer.name}'s GSTIN`, done: !!invoice.customer.gstin, href: '/customers' },
    { label: `${invoice.customer.name}'s contact / phone`, done: !!(invoice.customer.contact || invoice.customer.phone), href: '/customers' },
    { label: 'HSN/SAC code on every line item', done: lines.length > 0 && lines.every((l) => !!l.hsn) },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/invoices" className="flex items-center gap-1.5 text-[13px] font-bold text-ink-soft">
          <ArrowLeft size={15} /> Back to invoices
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={invoice.status} overdue={invoice.status !== 'PAID' && invoice.due < new Date()} />
          {invoice.status !== 'PAID' && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/new?edit=${invoice.id}`}>
                <Pencil size={13} /> Edit
              </Link>
            </Button>
          )}
          {isClassic && (
            <>
              <GenerateEinvoiceButton invoiceId={invoice.id} hasCredentials={!!company.nicUsername} status={invoice.einvoiceStatus} />
              <GenerateEwaybillButton
                invoiceId={invoice.id}
                hasCredentials={!!company.nicUsername}
                status={invoice.ewaybillStatus}
                defaults={{
                  vehicleNo: invoice.vehicleNo,
                  transporterId: invoice.transporterId,
                  transporterName: invoice.transporterName,
                  transporterDocNo: invoice.transporterDocNo,
                  transporterDocDate: invoice.transporterDocDate ? invoice.transporterDocDate.toISOString().slice(0, 10) : null,
                  transportMode: invoice.transportMode,
                  distanceKm: invoice.distanceKm,
                }}
              />
            </>
          )}
          <DownloadPdfButton invoiceId={invoice.id} invoiceNumber={invoice.number} />
          <PrintButton invoiceId={invoice.id} />
        </div>
      </div>

      {isClassic && (invoice.einvoiceStatus === 'FAILED' || invoice.ewaybillStatus === 'FAILED') && (
        <div className="mx-auto mb-4 max-w-[760px] space-y-1.5 print:hidden">
          {invoice.einvoiceStatus === 'FAILED' && invoice.einvoiceError && (
            <p className="rounded-lg2 border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-[12px] font-semibold text-destructive">
              e-Invoice generation failed: {invoice.einvoiceError}
            </p>
          )}
          {invoice.ewaybillStatus === 'FAILED' && invoice.ewbError && (
            <p className="rounded-lg2 border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-[12px] font-semibold text-destructive">
              e-Way Bill generation failed: {invoice.ewbError}
            </p>
          )}
        </div>
      )}

      {isClassic && <InvoiceCompletenessChecklist items={checklistItems} />}

      {!isPdfRender && <InlinePdfPreview invoiceId={invoice.id} />}

      {/* Kept in the DOM purely so PrintButton's window.print() has real
          content to print — see the `.invoice-print` rules in globals.css,
          and the identical pattern in the invoice builder's hidden
          print-only copy. Collapsed to zero height with clipped overflow
          (not `display:none`) outside of print: a `display:none` ancestor
          forces every descendant's layout to zero, which would make the
          self-measuring pagination in InvoiceSheet/InvoiceSheetClassic
          (see print-pagination.tsx) always read zero-height sections and
          silently fall back to "everything fits on one page" — height-0 +
          overflow-hidden keeps this invisible and footprint-free on the
          normal page while still letting the browser compute real layout
          for anything inside it. */}
      <div className="h-0 overflow-hidden print:h-auto print:overflow-visible">
        <div className="invoice-print mx-auto max-w-[760px]" style={PAPER_STYLE}>
          <div className="h-[5px] rounded-t-lg2 bg-brand print:hidden" />
        {isClassic ? (
          <InvoiceSheetClassic
            company={{ ...company, cgstRate: Number(invoice.cgstRate), sgstRate: Number(invoice.sgstRate), igstRate: Number(invoice.igstRate), cgstEnabled: invoice.cgstEnabled, sgstEnabled: invoice.sgstEnabled, igstEnabled: invoice.igstEnabled, pdfShowBankDetails: invoice.showBankDetails, pdfShowHsnSummary: invoice.showHsnSummary }}
            customer={customer}
            date={invoice.date.toISOString().slice(0, 10)}
            invoiceNumber={invoice.number}
            lines={lines}
            totals={totals}
            discountType={invoice.overallDiscountType}
            discountValue={Number(invoice.overallDiscountValue)}
            irn={invoice.irn}
            ackNo={invoice.ackNo}
            ackDate={invoice.ackDate ? invoice.ackDate.toISOString().slice(0, 10) : null}
            qrImageDataUrl={qrImageDataUrl}
            eway={
              invoice.ewbNo
                ? {
                    ewbNo: invoice.ewbNo,
                    ewbDate: invoice.ewbDate?.toISOString().slice(0, 10),
                    vehicleNo: invoice.vehicleNo,
                    transportMode: invoice.transportMode,
                    transporterName: invoice.transporterName,
                    distanceKm: invoice.distanceKm,
                  }
                : null
            }
            amountPaid={amountPaid}
            notes={invoice.notes}
            deliveryInstructions={invoice.deliveryInstructions}
            showTransportDetails={invoice.showTransportDetails}
            transportVehicleNo={invoice.transportVehicleNo}
            transportDriverName={invoice.transportDriverName}
            transportDriverPhone={invoice.transportDriverPhone}
            upiQrDataUrl={upiQrImageDataUrl}
            gpayNumber={gpayNumber}
            editable={false}
          />
        ) : (
          <InvoiceSheet
            company={{ ...company, cgstRate: Number(invoice.cgstRate), sgstRate: Number(invoice.sgstRate), igstRate: Number(invoice.igstRate), cgstEnabled: invoice.cgstEnabled, sgstEnabled: invoice.sgstEnabled, igstEnabled: invoice.igstEnabled, pdfShowBankDetails: invoice.showBankDetails }}
            customer={customer}
            date={invoice.date.toISOString().slice(0, 10)}
            due={invoice.due.toISOString().slice(0, 10)}
            invoiceNumber={invoice.number}
            lines={lines}
            totals={totals}
            totalSavings={totalSavings}
            amountPaid={amountPaid}
            discountType={invoice.overallDiscountType}
            discountValue={Number(invoice.overallDiscountValue)}
            upiQrDataUrl={upiQrImageDataUrl}
            gpayNumber={gpayNumber}
            editable={false}
          />
        )}
        {isClassic && invoice.ewbNo && (
          <InvoiceEwayBillSheet
            eway={{
              ewbNo: invoice.ewbNo,
              ewbDate: invoice.ewbDate?.toISOString().slice(0, 10) ?? '',
              validUpto: invoice.ewbValidUpto ? invoice.ewbValidUpto.toISOString().slice(0, 10) : null,
              transportMode: invoice.transportMode,
              distanceKm: invoice.distanceKm,
              vehicleNo: invoice.vehicleNo,
              transporterId: invoice.transporterId,
              transporterName: invoice.transporterName,
              transporterDocNo: invoice.transporterDocNo,
              transporterDocDate: invoice.transporterDocDate ? invoice.transporterDocDate.toISOString().slice(0, 10) : null,
            }}
            invoiceNumber={invoice.number}
            invoiceDate={invoice.date.toISOString().slice(0, 10)}
            irn={invoice.irn}
            qrImageDataUrl={qrImageDataUrl}
            fromCompany={{ name: company.name, gstin: company.gstin, address: company.address, state: company.state, pincode: company.pincode, district: company.district }}
            toCustomer={{ name: invoice.customer.name, shopName: invoice.customer.shopName, gstin: invoice.customer.gstin, address: invoice.customer.address, state: invoice.customer.state, pincode: invoice.customer.pincode }}
            taxableValue={totals.taxable}
            cgst={totals.cgst}
            sgst={totals.sgst}
            igst={totals.igst}
            roundOff={totals.roundOff}
            total={totals.total}
            useIgst={totals.useIgst}
            gstRateLabel={gstRateLabel}
            hsnGoods={hsnGoods}
          />
        )}
        </div>
      </div>
    </div>
  );
}
