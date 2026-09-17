'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCompany } from '@/lib/get-company';
import { computeTotals, decidesIgst } from '@/lib/gst';
import { decryptSecret } from '@/lib/secret';
import { generateIrn, cancelIrn, type EinvoiceInput, type EinvoiceCancelReasonCode } from '@/lib/nic/einvoice';
import { generateEwaybill, cancelEwaybill, type EwaybillInput, type EwaybillCancelReasonCode } from '@/lib/nic/ewaybill';
import type { NicCompanyConfig } from '@/lib/nic/types';

function toDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Common guard for both actions below — a company that hasn't entered NIC
 * credentials yet gets a friendly, actionable error instead of a crash deep
 * inside the API client. */
function resolveNicConfig(company: { nicSandbox: boolean; nicUsername: string | null; nicPasswordEnc: string | null; nicClientId: string | null; nicClientSecretEnc: string | null; gstin: string | null }):
  | { ok: true; config: NicCompanyConfig }
  | { ok: false; error: string } {
  if (!company.gstin) return { ok: false, error: 'Add your GSTIN in Company settings first.' };
  if (!company.nicUsername || !company.nicPasswordEnc || !company.nicClientId || !company.nicClientSecretEnc) {
    return { ok: false, error: 'Add your NIC e-Invoice/e-Way Bill API credentials in Company settings (e-Invoice / e-Way Bill tab) first.' };
  }
  return {
    ok: true,
    config: {
      sandbox: company.nicSandbox,
      gstin: company.gstin,
      username: company.nicUsername,
      password: decryptSecret(company.nicPasswordEnc),
      clientId: company.nicClientId,
      clientSecret: decryptSecret(company.nicClientSecretEnc),
    },
  };
}

export type GstComplianceResult = { error?: string };

export async function generateEinvoice(invoiceId: string): Promise<GstComplianceResult> {
  const company = await getCompany();
  const nic = resolveNicConfig(company);
  if (!nic.ok) return { error: nic.error };

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true, customer: true } });
  if (invoice.companyId !== company.id) return { error: 'Invoice not found.' };
  if (invoice.irn) return { error: 'This invoice already has an IRN.' };
  if (!company.pincode) return { error: 'Add your company pincode in Company settings first.' };
  const missingHsn = invoice.items.find((it) => !it.hsn);
  if (missingHsn) return { error: `"${missingHsn.name}" has no HSN/SAC code — add one to the product (or the line item) first.` };

  const rates = {
    cgstRate: Number(company.cgstRate),
    sgstRate: Number(company.sgstRate),
    igstRate: Number(company.igstRate),
    cgstEnabled: company.cgstEnabled,
    sgstEnabled: company.sgstEnabled,
    igstEnabled: company.igstEnabled,
  };
  const lineInputs = invoice.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) }));
  const totals = computeTotals(lineInputs, { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) }, rates, company.state, invoice.customer.state);
  const useIgst = decidesIgst(company.state, invoice.customer.state, rates.igstEnabled);
  const subtotal = lineInputs.reduce((s, l) => s + l.qty * l.rate * (1 - l.discount / 100), 0);

  const items: EinvoiceInput['items'] = invoice.items.map((it, i) => {
    const qty = Number(it.qty);
    const rate = Number(it.rate);
    const discount = Number(it.discount);
    const lineTaxableRaw = qty * rate * (1 - discount / 100);
    const share = subtotal > 0 ? lineTaxableRaw / subtotal : 0;
    const taxableValue = Math.max(lineTaxableRaw - totals.overallDiscountAmount * share, 0);
    const cgstAmount = !useIgst && rates.cgstEnabled ? taxableValue * (rates.cgstRate / 100) : 0;
    const sgstAmount = !useIgst && rates.sgstEnabled ? taxableValue * (rates.sgstRate / 100) : 0;
    const igstAmount = useIgst ? taxableValue * (rates.igstRate / 100) : 0;
    return {
      slNo: i + 1,
      hsn: it.hsn!,
      description: it.name,
      qty,
      unit: it.unit,
      unitPrice: rate,
      discount: qty * rate * (discount / 100),
      taxableValue,
      gstRate: useIgst ? rates.igstRate : rates.cgstRate + rates.sgstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
    };
  });

  const input: EinvoiceInput = {
    seller: { gstin: company.gstin!, legalName: company.name, address1: company.address ?? company.name, state: company.state, pincode: company.pincode, phone: company.phone, email: company.email },
    buyer: {
      gstin: invoice.customer.gstin,
      legalName: invoice.customer.name,
      address1: invoice.customer.address ?? invoice.customer.name,
      state: invoice.customer.state,
      pincode: invoice.customer.pincode,
      phone: invoice.customer.phone,
      email: invoice.customer.email,
    },
    docNumber: invoice.number,
    docDate: toDdMmYyyy(invoice.date),
    items,
    totalTaxableValue: totals.taxable,
    totalCgst: totals.cgst,
    totalSgst: totals.sgst,
    totalIgst: totals.igst,
    roundOff: totals.roundOff,
    totalInvoiceValue: totals.total,
  };

  const result = await generateIrn(nic.config, input);
  if (!result.ok) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { einvoiceStatus: 'FAILED', einvoiceError: result.error } });
    revalidatePath(`/invoices/${invoiceId}`);
    return { error: result.error };
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      irn: result.data.irn,
      ackNo: result.data.ackNo,
      ackDate: new Date(result.data.ackDate),
      signedQrCode: result.data.signedQrCode,
      einvoiceStatus: 'GENERATED',
      einvoiceError: null,
    },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

const TransportDetailsSchema = z.object({
  vehicleNo: z.string().min(1, 'Vehicle number is required'),
  transporterId: z.string().optional().nullable(),
  transporterName: z.string().optional().nullable(),
  transporterDocNo: z.string().optional().nullable(),
  transporterDocDate: z.string().optional().nullable(),
  transportMode: z.enum(['ROAD', 'RAIL', 'AIR', 'SHIP']).default('ROAD'),
  distanceKm: z.coerce.number().int().min(1, 'Approx. distance (km) is required'),
});

const TRANSPORT_MODE_CODE = { ROAD: '1', RAIL: '2', AIR: '3', SHIP: '4' } as const;

export async function generateEwaybillAction(invoiceId: string, transportDetails: z.infer<typeof TransportDetailsSchema>): Promise<GstComplianceResult> {
  const parsedTransport = TransportDetailsSchema.safeParse(transportDetails);
  if (!parsedTransport.success) return { error: parsedTransport.error.issues[0]?.message ?? 'Invalid transport details' };

  const company = await getCompany();
  const nic = resolveNicConfig(company);
  if (!nic.ok) return { error: nic.error };

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: true, customer: true } });
  if (invoice.companyId !== company.id) return { error: 'Invoice not found.' };
  if (invoice.ewbNo) return { error: 'This invoice already has an e-Way Bill.' };
  if (!company.pincode) return { error: 'Add your company pincode in Company settings first.' };
  const missingHsn = invoice.items.find((it) => !it.hsn);
  if (missingHsn) return { error: `"${missingHsn.name}" has no HSN/SAC code — add one to the product (or the line item) first.` };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { ...parsedTransport.data, transporterDocDate: parsedTransport.data.transporterDocDate ? new Date(parsedTransport.data.transporterDocDate) : null },
  });

  const rates = {
    cgstRate: Number(company.cgstRate),
    sgstRate: Number(company.sgstRate),
    igstRate: Number(company.igstRate),
    cgstEnabled: company.cgstEnabled,
    sgstEnabled: company.sgstEnabled,
    igstEnabled: company.igstEnabled,
  };
  const lineInputs = invoice.items.map((it) => ({ qty: Number(it.qty), rate: Number(it.rate), discount: Number(it.discount) }));
  const totals = computeTotals(lineInputs, { type: invoice.overallDiscountType, value: Number(invoice.overallDiscountValue) }, rates, company.state, invoice.customer.state);

  const hsnGroups = new Map<string, { qty: number; unit: string; taxableValue: number }>();
  for (const it of invoice.items) {
    const hsn = it.hsn!;
    const g = hsnGroups.get(hsn) ?? { qty: 0, unit: it.unit, taxableValue: 0 };
    g.qty += Number(it.qty);
    g.taxableValue += Number(it.qty) * Number(it.rate) * (1 - Number(it.discount) / 100);
    hsnGroups.set(hsn, g);
  }

  const input: EwaybillInput = {
    supplyType: 'O',
    docNumber: invoice.number,
    docDate: toDdMmYyyy(invoice.date),
    fromGstin: company.gstin!,
    fromState: company.state,
    fromPincode: company.pincode,
    toGstin: invoice.customer.gstin,
    toState: invoice.customer.state,
    toPincode: invoice.customer.pincode,
    totalValue: totals.total,
    cgstValue: totals.cgst,
    sgstValue: totals.sgst,
    igstValue: totals.igst,
    hsnGoods: Array.from(hsnGroups.entries()).map(([hsn, g]) => ({ hsn, description: hsn, qty: g.qty, unit: g.unit, taxableValue: g.taxableValue })),
    transportMode: TRANSPORT_MODE_CODE[parsedTransport.data.transportMode],
    vehicleNo: parsedTransport.data.vehicleNo,
    transporterId: parsedTransport.data.transporterId,
    transporterName: parsedTransport.data.transporterName,
    distanceKm: parsedTransport.data.distanceKm,
  };

  const result = await generateEwaybill(nic.config, input);
  if (!result.ok) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { ewaybillStatus: 'FAILED', ewbError: result.error } });
    revalidatePath(`/invoices/${invoiceId}`);
    return { error: result.error };
  }

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      ewbNo: result.data.ewbNo,
      ewbDate: new Date(result.data.ewbDate),
      ewbValidUpto: new Date(result.data.validUpto),
      ewaybillStatus: 'GENERATED',
      ewbError: null,
    },
  });
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

const CancelReasonSchema = z.object({
  reasonCode: z.enum(['1', '2', '3', '4']),
  remark: z.string().min(1, 'A short cancellation remark is required'),
});

/** GST rules give a 24-hour window to cancel an IRN — once cancelled, the
 * same invoice number can't be re-submitted for a fresh IRN (a corrected
 * invoice needs its own number), so this deliberately does NOT reset
 * einvoiceStatus back to NOT_GENERATED. */
export async function cancelEinvoiceAction(invoiceId: string, input: { reasonCode: EinvoiceCancelReasonCode; remark: string }): Promise<GstComplianceResult> {
  const parsed = CancelReasonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid cancellation reason' };

  const company = await getCompany();
  const nic = resolveNicConfig(company);
  if (!nic.ok) return { error: nic.error };

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.companyId !== company.id) return { error: 'Invoice not found.' };
  if (!invoice.irn) return { error: 'This invoice has no IRN to cancel.' };
  if (invoice.einvoiceStatus !== 'GENERATED') return { error: 'Only a generated e-Invoice can be cancelled.' };

  const result = await cancelIrn(nic.config, invoice.irn, parsed.data.reasonCode, parsed.data.remark);
  if (!result.ok) return { error: result.error };

  await prisma.invoice.update({ where: { id: invoiceId }, data: { einvoiceStatus: 'CANCELLED', einvoiceError: null } });
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}

export async function cancelEwaybillAction(invoiceId: string, input: { reasonCode: EwaybillCancelReasonCode; remark: string }): Promise<GstComplianceResult> {
  const parsed = CancelReasonSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid cancellation reason' };

  const company = await getCompany();
  const nic = resolveNicConfig(company);
  if (!nic.ok) return { error: nic.error };

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (invoice.companyId !== company.id) return { error: 'Invoice not found.' };
  if (!invoice.ewbNo) return { error: 'This invoice has no e-Way Bill to cancel.' };
  if (invoice.ewaybillStatus !== 'GENERATED') return { error: 'Only a generated e-Way Bill can be cancelled.' };

  const result = await cancelEwaybill(nic.config, invoice.ewbNo, parsed.data.reasonCode, parsed.data.remark);
  if (!result.ok) return { error: result.error };

  await prisma.invoice.update({ where: { id: invoiceId }, data: { ewaybillStatus: 'CANCELLED', ewbError: null } });
  revalidatePath(`/invoices/${invoiceId}`);
  return {};
}
