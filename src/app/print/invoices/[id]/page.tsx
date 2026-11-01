import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { COMPANY_ID } from '@/lib/company-id';
import { verifySignedToken } from '@/lib/signed-token';
import { computeInvoiceTotals } from '@/lib/invoice-totals';
import { isGstLayout } from '@/lib/invoice-template';
import { qrDataUrl, upiQrDataUrl } from '@/lib/qr';
import { PDF_PAGE } from '@/lib/pdf-browser';
import { PAPER_STYLE } from '@/lib/paper-theme';
import { InvoiceSheet } from '@/components/invoices/invoice-sheet';
import { InvoiceSheetClassic } from '@/components/invoices/invoice-sheet-classic';
import { InvoiceEwayBillSheet } from '@/components/invoices/invoice-eway-bill-sheet';
import { inlineImage } from '../../inline-image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * What the PDF renderer (src/lib/invoice-pdf.ts) prints: just the invoice
 * sheet — no app shell, sidebar, tour or session fetch to wait on — laid
 * out at exactly the A4 content width (186mm) so the sheet's own page split
 * is measured at the width it prints at.
 *
 * Outside the (app) group and src/proxy.ts's matcher on purpose: the
 * headless browser has no session. Access is a short-lived signed
 * 'print-invoice' token for this one invoice in `?t=` instead; anything
 * else is a 404.
 */
export default async function PrintInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (verifySignedToken('print-invoice', typeof t === 'string' ? t : null) !== id) notFound();

  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, items: { include: { product: { select: { packQty: true } } } } },
    }),
    prisma.company.findUnique({ where: { id: COMPANY_ID } }),
  ]);
  if (!invoice || !company) notFound();

  const template = company.invoiceTemplate;
  const gstLayout = isGstLayout(template);

  const [logoUrl, signatureUrl, qrImageDataUrl, upiQrImageDataUrl] = await Promise.all([
    inlineImage(company.logoUrl),
    gstLayout ? inlineImage(company.signatureUrl) : null,
    gstLayout && invoice.signedQrCode ? qrDataUrl(invoice.signedQrCode) : null,
    // The invoice's own frozen snapshot, not the live Company toggle — see
    // schema.prisma's comment on Invoice.showUpiQr/showGpayNumber.
    invoice.showUpiQr ? upiQrDataUrl(company.upi, company.name) : null,
  ]);
  const gpayNumber = invoice.showGpayNumber ? company.phone || company.altPhone : null;

  const lines = invoice.items.map((it) => ({
    lineId: it.id,
    productId: it.productId,
    name: it.name,
    unit: it.unit,
    qty: Number(it.qty),
    rate: Number(it.rate),
    discount: Number(it.discount),
    // Display hint only (MODERN's "1 box + 20 pc") — the product's current
    // pack size, not snapshotted.
    packQty: it.product?.packQty ?? null,
    hsn: it.hsn,
    batch: it.batch,
    altUnit: it.altUnit,
    altQtyPerUnit: it.altQtyPerUnit ? Number(it.altQtyPerUnit) : null,
  }));

  // Only plain, serializable fields cross into the (client) sheets — and
  // nothing they don't print (no NIC credentials, no Prisma Decimals). GST
  // rates and section toggles come from the invoice's own snapshot, never
  // the live company settings (see schema.prisma's Invoice.cgstRate).
  const sheetCompany = {
    name: company.name,
    address: company.address,
    pincode: company.pincode,
    state: company.state,
    gstin: company.gstin,
    pan: company.pan,
    fssaiNo: company.fssaiNo,
    phone: company.phone,
    altPhone: company.altPhone,
    email: company.email,
    bankName: company.bankName,
    bankAcc: company.bankAcc,
    ifsc: company.ifsc,
    branch: company.branch,
    upi: company.upi,
    terms: company.terms,
    logoUrl,
    signatureUrl,
    signatoryName: company.signatoryName,
    currency: company.currency,
    defaultHsn: company.defaultHsn,
    cgstRate: Number(invoice.cgstRate),
    sgstRate: Number(invoice.sgstRate),
    igstRate: Number(invoice.igstRate),
    cgstEnabled: invoice.cgstEnabled,
    sgstEnabled: invoice.sgstEnabled,
    igstEnabled: invoice.igstEnabled,
    pdfShowBankDetails: invoice.showBankDetails,
    pdfShowHsnSummary: invoice.showHsnSummary,
  };
  const c = invoice.customer;
  const customer = {
    name: c.name,
    shopName: c.shopName,
    address: c.address,
    state: c.state,
    gstin: c.gstin,
    fssaiNo: c.fssaiNo,
    pincode: c.pincode,
    contact: c.contact,
    phone: c.phone,
    altPhone: c.altPhone,
  };

  const totals = computeInvoiceTotals(invoice, company.state);
  const amountPaid = Number(invoice.amountPaid);
  const common = {
    company: sheetCompany,
    customer,
    date: isoDate(invoice.date),
    due: isoDate(invoice.due),
    invoiceNumber: invoice.number,
    lines,
    totals,
    amountPaid,
    discountType: invoice.overallDiscountType,
    discountValue: Number(invoice.overallDiscountValue),
    upiQrDataUrl: upiQrImageDataUrl,
    gpayNumber,
    editable: false,
  };

  return (
    <main className="print-doc invoice-sheet-mono mx-auto bg-white" style={{ ...PAPER_STYLE, width: `${PDF_PAGE.contentWidthMm}mm` }}>
      {gstLayout ? (
        <InvoiceSheetClassic
          {...common}
          variant={template === 'CLEAN' ? 'clean' : 'classic'}
          irn={invoice.irn}
          ackNo={invoice.ackNo}
          ackDate={invoice.ackDate ? isoDate(invoice.ackDate) : null}
          qrImageDataUrl={qrImageDataUrl}
          eway={
            invoice.ewbNo
              ? {
                  ewbNo: invoice.ewbNo,
                  ewbDate: invoice.ewbDate ? isoDate(invoice.ewbDate) : null,
                  vehicleNo: invoice.vehicleNo,
                  transportMode: invoice.transportMode,
                  transporterName: invoice.transporterName,
                  distanceKm: invoice.distanceKm,
                }
              : null
          }
          notes={invoice.notes}
          deliveryInstructions={invoice.deliveryInstructions}
          showTransportDetails={invoice.showTransportDetails}
          transportVehicleNo={invoice.transportVehicleNo}
          transportDriverName={invoice.transportDriverName}
          transportDriverPhone={invoice.transportDriverPhone}
        />
      ) : (
        <InvoiceSheet {...common} />
      )}

      {gstLayout && invoice.ewbNo && (
        <InvoiceEwayBillSheet
          eway={{
            ewbNo: invoice.ewbNo,
            ewbDate: invoice.ewbDate ? isoDate(invoice.ewbDate) : '',
            validUpto: invoice.ewbValidUpto ? isoDate(invoice.ewbValidUpto) : null,
            transportMode: invoice.transportMode,
            distanceKm: invoice.distanceKm,
            vehicleNo: invoice.vehicleNo,
            transporterId: invoice.transporterId,
            transporterName: invoice.transporterName,
            transporterDocNo: invoice.transporterDocNo,
            transporterDocDate: invoice.transporterDocDate ? isoDate(invoice.transporterDocDate) : null,
          }}
          invoiceNumber={invoice.number}
          invoiceDate={isoDate(invoice.date)}
          irn={invoice.irn}
          qrImageDataUrl={qrImageDataUrl}
          fromCompany={{ name: company.name, gstin: company.gstin, address: company.address, state: company.state, pincode: company.pincode, district: company.district }}
          toCustomer={{ name: c.name, shopName: c.shopName, gstin: c.gstin, address: c.address, state: c.state, pincode: c.pincode }}
          taxableValue={totals.taxable}
          cgst={totals.cgst}
          sgst={totals.sgst}
          igst={totals.igst}
          roundOff={totals.roundOff}
          total={totals.total}
          useIgst={totals.useIgst}
          gstRateLabel={totals.useIgst ? `${Number(invoice.igstRate)}%` : `${Number(invoice.cgstRate)}+${Number(invoice.sgstRate)}`}
          hsnGoods={hsnGoods(lines)}
        />
      )}
    </main>
  );
}

/** The e-Way Bill page's goods table: one row per HSN code. */
function hsnGoods(lines: { hsn?: string | null; name: string; unit: string; qty: number; rate: number; discount: number }[]) {
  const groups = new Map<string, { qty: number; unit: string; taxableValue: number; names: Set<string> }>();
  for (const l of lines) {
    const hsn = l.hsn?.trim() || '—';
    const g = groups.get(hsn) ?? { qty: 0, unit: l.unit, taxableValue: 0, names: new Set<string>() };
    g.qty += l.qty;
    g.taxableValue += l.qty * l.rate * (1 - l.discount / 100);
    g.names.add(l.name);
    groups.set(hsn, g);
  }
  return Array.from(groups, ([hsn, g]) => ({ hsn, description: Array.from(g.names).join(' & '), qty: `${g.qty} ${g.unit}`, taxableValue: g.taxableValue }));
}
