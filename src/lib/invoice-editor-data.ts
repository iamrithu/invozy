import { prisma } from './prisma';

/** Everything the invoice editor needs to reopen a saved invoice exactly as
 * it was built — shared by /invoices/[id] (the editor itself) so a saved
 * invoice is always edited from its own frozen snapshot, never from
 * Company's current live settings. Returns plain JSON-safe values (no
 * Decimal/Date instances) since it's handed straight to a client component. */
export async function loadInvoiceForEditor(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      items: { include: { product: { select: { packQty: true } } } },
      payments: { orderBy: { date: 'asc' } },
    },
  });
  if (!invoice) return null;
  const { creditLimit, ...customer } = invoice.customer;

  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    customer: { ...JSON.parse(JSON.stringify(customer)), creditLimit: Number(creditLimit) },
    customerId: invoice.customerId,
    date: invoice.date.toISOString().slice(0, 10),
    due: invoice.due.toISOString().slice(0, 10),
    overallDiscountType: invoice.overallDiscountType,
    overallDiscountValue: Number(invoice.overallDiscountValue),
    notes: invoice.notes ?? '',
    deliveryInstructions: invoice.deliveryInstructions ?? '',
    showTransportDetails: invoice.showTransportDetails,
    transportVehicleNo: invoice.transportVehicleNo ?? '',
    transportDriverName: invoice.transportDriverName ?? '',
    transportDriverPhone: invoice.transportDriverPhone ?? '',
    irn: invoice.irn,
    ackNo: invoice.ackNo,
    ackDate: invoice.ackDate ? invoice.ackDate.toISOString().slice(0, 10) : null,
    einvoiceStatus: invoice.einvoiceStatus,
    einvoiceError: invoice.einvoiceError,
    ewaybillStatus: invoice.ewaybillStatus,
    ewbError: invoice.ewbError,
    ewbNo: invoice.ewbNo,
    transport: {
      vehicleNo: invoice.vehicleNo,
      transporterId: invoice.transporterId,
      transporterName: invoice.transporterName,
      transporterDocNo: invoice.transporterDocNo,
      transporterDocDate: invoice.transporterDocDate ? invoice.transporterDocDate.toISOString().slice(0, 10) : null,
      transportMode: invoice.transportMode,
      distanceKm: invoice.distanceKm,
    },
    // False only on a draft saved before drafts took stock — it holds none
    // of its lines' stock yet (see schema.prisma).
    stockTaken: invoice.stockTaken,
    total: Number(invoice.total),
    amountPaid: Number(invoice.amountPaid),
    lastRemindedAt: invoice.lastRemindedAt ? invoice.lastRemindedAt.toISOString() : null,
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      date: p.date.toISOString().slice(0, 10),
      mode: p.mode,
      reference: p.reference,
      receiptNo: p.receiptNo,
      creditNoteId: p.creditNoteId,
    })),
    // The invoice's own frozen GST snapshot — see schema.prisma's
    // Invoice.cgstRate comment.
    cgstRate: Number(invoice.cgstRate),
    sgstRate: Number(invoice.sgstRate),
    igstRate: Number(invoice.igstRate),
    cgstEnabled: invoice.cgstEnabled,
    sgstEnabled: invoice.sgstEnabled,
    igstEnabled: invoice.igstEnabled,
    showBankDetails: invoice.showBankDetails,
    showHsnSummary: invoice.showHsnSummary,
    showUpiQr: invoice.showUpiQr,
    showGpayNumber: invoice.showGpayNumber,
    lines: invoice.items.map((it) => ({
      lineId: it.id,
      productId: it.productId,
      name: it.name,
      unit: it.unit,
      qty: Number(it.qty),
      rate: Number(it.rate),
      discount: Number(it.discount),
      packQty: it.product?.packQty ?? null,
      hsn: it.hsn,
      batch: it.batch,
      altUnit: it.altUnit,
      altQtyPerUnit: it.altQtyPerUnit ? Number(it.altQtyPerUnit) : null,
      // What this line already took out of stock — the builder adds it back
      // when checking availability, so re-saving an unchanged invoice never
      // reports a false shortage.
      stockQty: it.stockQty != null ? Number(it.stockQty) : null,
      free: Number(it.rate) === 0 && /\(free\)\s*$/i.test(it.name),
    })),
  };
}

export type EditorInvoice = NonNullable<Awaited<ReturnType<typeof loadInvoiceForEditor>>>;
