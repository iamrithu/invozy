import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals, fmtInr } from '@/lib/gst';
import { StatusBadge } from '@/components/ui/status-badge';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceEwayBillSheet } from '@/components/invoices/invoice-eway-bill-sheet';
import { qrDataUrl } from '@/lib/qr';
import { PrintButton } from './print-button';
import { DownloadPdfButton } from '@/components/invoices/download-pdf-button';
import { GenerateEinvoiceButton } from './generate-einvoice-button';
import { GenerateEwaybillButton } from './generate-ewaybill-button';
import { InvoiceCompletenessChecklist } from '@/components/invoices/invoice-completeness-checklist';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: { select: { packQty: true } } } }, payments: true },
    }),
    getCompany(),
  ]);
  if (!invoice) notFound();

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

  const isClassic = company.invoiceTemplate === 'CLASSIC';
  const qrImageDataUrl = isClassic && invoice.signedQrCode ? await qrDataUrl(invoice.signedQrCode) : null;

  const totals = computeTotals(
    lines.map((l) => ({ qty: l.qty, rate: l.rate, discount: l.discount })),
    { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) },
    {
      cgstRate: Number(company.cgstRate),
      sgstRate: Number(company.sgstRate),
      igstRate: Number(company.igstRate),
      cgstEnabled: company.cgstEnabled,
      sgstEnabled: company.sgstEnabled,
      igstEnabled: company.igstEnabled,
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
  const gstRateLabel = totals.useIgst ? `${Number(company.igstRate)}%` : `${Number(company.cgstRate)}+${Number(company.sgstRate)}`;

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
          <PrintButton />
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

      {/* Opens the dedicated full-screen PDF flow (src/app/invoices/[id]/preview)
          — renders the real generated PDF via pdf.js (canvas), which works
          identically on every device, unlike an embedded <iframe> relying
          on the browser's own PDF plugin (a blank box on most mobile
          browsers). */}
      <Link
        href={`/invoices/${invoice.id}/preview`}
        className="mx-auto flex max-w-[900px] flex-col items-center gap-2.5 rounded-xl2 border border-dashed border-line bg-surface p-10 text-center shadow-card transition-colors hover:border-brand/50 print:hidden"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand-dark">
          <Eye size={20} />
        </span>
        <span className="text-[14px] font-bold text-ink">Preview PDF</span>
        <span className="text-[11.5px] text-ink-faint">Opens a full-screen view of the exact PDF that downloads</span>
      </Link>

      {/* Kept in the DOM (invisible on screen) purely so PrintButton's
          window.print() has real content to print — see the `.invoice-print`
          rules in globals.css, and the identical pattern in the invoice
          builder's hidden print-only copy. */}
      <div className="invoice-print hidden print:block mx-auto max-w-[760px]" style={PAPER_STYLE}>
        <div className="h-[5px] rounded-t-lg2 bg-brand print:hidden" />
        {isClassic ? (
          <InvoiceSheetClassic
            company={{ ...company, cgstRate: Number(company.cgstRate), sgstRate: Number(company.sgstRate), igstRate: Number(company.igstRate) }}
            customer={invoice.customer}
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
            editable={false}
          />
        ) : (
          <InvoiceSheet
            company={{ ...company, cgstRate: Number(company.cgstRate), sgstRate: Number(company.sgstRate), igstRate: Number(company.igstRate) }}
            customer={invoice.customer}
            date={invoice.date.toISOString().slice(0, 10)}
            due={invoice.due.toISOString().slice(0, 10)}
            invoiceNumber={invoice.number}
            lines={lines}
            totals={totals}
            totalSavings={totalSavings}
            discountType={invoice.overallDiscountType}
            discountValue={Number(invoice.overallDiscountValue)}
            editable={false}
          />
        )}
        {amountPaid > 0 && (
          <div className="mt-3 flex justify-end">
            <div className="w-full max-w-[280px] rounded-md2 border border-line bg-surface p-3 text-[12px]">
              <div className="flex justify-between text-green">
                <span>Paid</span>
                <span className="font-mono font-bold">−{fmtInr(amountPaid)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-dashed border-line pt-1 text-[13px] font-extrabold text-ink">
                <span>Balance</span>
                <span className="font-mono">{fmtInr(totals.total - amountPaid)}</span>
              </div>
            </div>
          </div>
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
            toCustomer={{ name: invoice.customer.name, gstin: invoice.customer.gstin, address: invoice.customer.address, state: invoice.customer.state, pincode: invoice.customer.pincode }}
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
  );
}
