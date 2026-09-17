import { authenticate } from './auth';
import { aesEncrypt, aesDecrypt } from './crypto';
import { einvoiceBaseUrl } from './types';
import { gstStateCode } from '@/lib/gst-state-codes';
import type { NicResult, NicCompanyConfig } from './types';

export type EinvoiceSeller = { gstin: string; legalName: string; address1: string; state: string; pincode: string; phone?: string | null; email?: string | null };
export type EinvoiceBuyer = { gstin?: string | null; legalName: string; address1: string; state: string; pincode?: string | null; phone?: string | null; email?: string | null };
export type EinvoiceItem = { slNo: number; hsn: string; description: string; qty: number; unit: string; unitPrice: number; discount: number; taxableValue: number; gstRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number };

export type EinvoiceInput = {
  seller: EinvoiceSeller;
  buyer: EinvoiceBuyer;
  docNumber: string;
  docDate: string; // dd/mm/yyyy — the schema requires this exact format
  items: EinvoiceItem[];
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  totalInvoiceValue: number;
};

export type EinvoiceResult = { irn: string; ackNo: string; ackDate: string; signedQrCode: string; signedInvoice: string };

/** Maps our invoice data to the GSTN e-Invoice schema v1.1 (SellerDtls/
 * BuyerDtls/DocDtls/ItemList/ValDtls) — see https://einvoice1.gst.gov.in
 * schema notification. Field names below (Gstin, LglNm, Addr1, Stcd, Pin,
 * TranDtls, ItemList[].HsnCd, etc.) are the public, GSTN-notified schema —
 * stable regardless of which GSP/NIC endpoint ultimately receives it. */
function buildPayload(input: EinvoiceInput) {
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: 'INV', No: input.docNumber, Dt: input.docDate },
    SellerDtls: {
      Gstin: input.seller.gstin,
      LglNm: input.seller.legalName,
      Addr1: input.seller.address1.slice(0, 100),
      Loc: input.seller.state,
      Pin: Number(input.seller.pincode),
      Stcd: gstStateCode(input.seller.state),
      Ph: input.seller.phone ?? undefined,
      Em: input.seller.email ?? undefined,
    },
    BuyerDtls: {
      Gstin: input.buyer.gstin ?? 'URP', // "Unregistered Person" — GSTN's own convention for a buyer with no GSTIN
      LglNm: input.buyer.legalName,
      Pos: gstStateCode(input.buyer.state),
      Addr1: input.buyer.address1.slice(0, 100),
      Loc: input.buyer.state,
      Pin: input.buyer.pincode ? Number(input.buyer.pincode) : undefined,
      Stcd: gstStateCode(input.buyer.state),
      Ph: input.buyer.phone ?? undefined,
      Em: input.buyer.email ?? undefined,
    },
    ItemList: input.items.map((it) => ({
      SlNo: String(it.slNo),
      PrdDesc: it.description,
      IsServc: 'N',
      HsnCd: it.hsn,
      Qty: it.qty,
      Unit: it.unit.slice(0, 8).toUpperCase(),
      UnitPrice: it.unitPrice,
      TotAmt: it.qty * it.unitPrice,
      Discount: it.discount,
      AssAmt: it.taxableValue,
      GstRt: it.gstRate,
      CgstAmt: it.cgstAmount,
      SgstAmt: it.sgstAmount,
      IgstAmt: it.igstAmount,
      TotItemVal: it.taxableValue + it.cgstAmount + it.sgstAmount + it.igstAmount,
    })),
    ValDtls: {
      AssVal: input.totalTaxableValue,
      CgstVal: input.totalCgst,
      SgstVal: input.totalSgst,
      IgstVal: input.totalIgst,
      RndOffAmt: input.roundOff,
      TotInvVal: input.totalInvoiceValue,
    },
  };
}

export async function generateIrn(config: NicCompanyConfig, input: EinvoiceInput): Promise<NicResult<EinvoiceResult>> {
  const baseUrl = einvoiceBaseUrl(config.sandbox);
  const session = await authenticate(baseUrl, config);
  if (!session.ok) return session;

  try {
    const payload = buildPayload(input);
    const encryptedData = aesEncrypt(session.data.sek, JSON.stringify(payload));

    const res = await fetch(`${baseUrl}/eicore/v1.03/Invoice`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        gstin: config.gstin,
        AuthToken: session.data.authToken,
      },
      body: JSON.stringify({ Data: encryptedData }),
    });
    if (!res.ok) return { ok: false, error: `NIC e-Invoice request failed: HTTP ${res.status}` };
    const json = await res.json();
    if (json?.Status !== 1) {
      const msg = json?.ErrorDetails?.map((e: any) => e.ErrorMessage).join('; ') ?? 'NIC rejected the e-Invoice request';
      return { ok: false, error: msg };
    }
    const decrypted = JSON.parse(aesDecrypt(session.data.sek, json.Data));
    return {
      ok: true,
      data: { irn: decrypted.Irn, ackNo: String(decrypted.AckNo), ackDate: decrypted.AckDt, signedQrCode: decrypted.SignedQRCode, signedInvoice: decrypted.SignedInvoice },
    };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'NIC e-Invoice generation failed' };
  }
}

/** Cancellation reason codes per the GSTN e-Invoice schema — 1 Duplicate,
 * 2 Data entry mistake, 3 Order cancelled, 4 Others. */
export type EinvoiceCancelReasonCode = '1' | '2' | '3' | '4';

export async function cancelIrn(config: NicCompanyConfig, irn: string, reasonCode: EinvoiceCancelReasonCode, remark: string): Promise<NicResult<{ cancelDate: string }>> {
  const baseUrl = einvoiceBaseUrl(config.sandbox);
  const session = await authenticate(baseUrl, config);
  if (!session.ok) return session;

  try {
    const encryptedData = aesEncrypt(session.data.sek, JSON.stringify({ Irn: irn, CnlRsn: reasonCode, CnlRem: remark.slice(0, 100) }));
    const res = await fetch(`${baseUrl}/eicore/v1.03/Invoice/Cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', client_id: config.clientId, client_secret: config.clientSecret, gstin: config.gstin, AuthToken: session.data.authToken },
      body: JSON.stringify({ Data: encryptedData }),
    });
    if (!res.ok) return { ok: false, error: `NIC e-Invoice cancel failed: HTTP ${res.status}` };
    const json = await res.json();
    if (json?.Status !== 1) return { ok: false, error: json?.ErrorDetails?.map((e: any) => e.ErrorMessage).join('; ') ?? 'NIC rejected the cancellation' };
    const decrypted = JSON.parse(aesDecrypt(session.data.sek, json.Data));
    return { ok: true, data: { cancelDate: decrypted.CancelDate } };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'NIC e-Invoice cancellation failed' };
  }
}
