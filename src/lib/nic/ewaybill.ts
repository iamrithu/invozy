import { authenticate } from './auth';
import { aesEncrypt, aesDecrypt } from './crypto';
import { ewaybillBaseUrl } from './types';
import { gstStateCode } from '@/lib/gst-state-codes';
import type { NicResult, NicCompanyConfig } from './types';

export type EwaybillInput = {
  supplyType: 'O' | 'I'; // Outward / Inward
  docNumber: string;
  docDate: string; // dd/mm/yyyy
  fromGstin: string;
  fromState: string;
  fromPincode: string;
  toGstin?: string | null;
  toState: string;
  toPincode?: string | null;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  hsnGoods: { hsn: string; description: string; qty: number; unit: string; taxableValue: number }[];
  transportMode: '1' | '2' | '3' | '4'; // Road/Rail/Air/Ship
  vehicleNo?: string | null;
  transporterId?: string | null;
  transporterName?: string | null;
  distanceKm: number;
};

export type EwaybillResult = { ewbNo: string; ewbDate: string; validUpto: string };

function buildPayload(input: EwaybillInput) {
  return {
    supplyType: input.supplyType,
    subSupplyType: '1',
    docType: 'INV',
    docNo: input.docNumber,
    docDate: input.docDate,
    fromGstin: input.fromGstin,
    fromStateCode: Number(gstStateCode(input.fromState)),
    fromPincode: Number(input.fromPincode),
    toGstin: input.toGstin ?? 'URP',
    toStateCode: Number(gstStateCode(input.toState)),
    toPincode: input.toPincode ? Number(input.toPincode) : undefined,
    totalValue: input.totalValue,
    cgstValue: input.cgstValue,
    sgstValue: input.sgstValue,
    igstValue: input.igstValue,
    itemList: input.hsnGoods.map((g) => ({ productName: g.description, hsnCode: g.hsn, quantity: g.qty, qtyUnit: g.unit.slice(0, 8).toUpperCase(), taxableAmount: g.taxableValue })),
    transMode: input.transportMode,
    transDistance: String(input.distanceKm),
    vehicleNo: input.vehicleNo ?? undefined,
    transporterId: input.transporterId ?? undefined,
    transporterName: input.transporterName ?? undefined,
  };
}

/** e-Way Bill is a separate NIC system from e-Invoice (own base URL, own
 * auth) and a separate legal obligation — threshold/interstate-triggered,
 * independent of whether the business is e-Invoice-mandated. See
 * TODO(nic-sandbox) in auth.ts/crypto.ts for the shared handshake caveat. */
export async function generateEwaybill(config: NicCompanyConfig, input: EwaybillInput): Promise<NicResult<EwaybillResult>> {
  const baseUrl = ewaybillBaseUrl(config.sandbox);
  const session = await authenticate(baseUrl, config);
  if (!session.ok) return session;

  try {
    const encryptedData = aesEncrypt(session.data.sek, JSON.stringify(buildPayload(input)));
    const res = await fetch(`${baseUrl}/ewaybillapi/v1.03/ewayapi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', client_id: config.clientId, client_secret: config.clientSecret, gstin: config.gstin, AuthToken: session.data.authToken },
      body: JSON.stringify({ action: 'GENEWAYBILL', Data: encryptedData }),
    });
    if (!res.ok) return { ok: false, error: `NIC e-Way Bill request failed: HTTP ${res.status}` };
    const json = await res.json();
    if (json?.Status !== 1) return { ok: false, error: json?.ErrorDetails?.map((e: any) => e.ErrorMessage).join('; ') ?? 'NIC rejected the e-Way Bill request' };
    const decrypted = JSON.parse(aesDecrypt(session.data.sek, json.Data));
    return { ok: true, data: { ewbNo: String(decrypted.ewayBillNo), ewbDate: decrypted.ewayBillDate, validUpto: decrypted.validUpto } };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'NIC e-Way Bill generation failed' };
  }
}

/** Cancellation reason codes per the e-Way Bill system — 1 Duplicate,
 * 2 Order cancelled, 3 Data entry mistake, 4 Others. */
export type EwaybillCancelReasonCode = '1' | '2' | '3' | '4';

export async function cancelEwaybill(config: NicCompanyConfig, ewbNo: string, reasonCode: EwaybillCancelReasonCode, remark: string): Promise<NicResult<{ cancelDate: string }>> {
  const baseUrl = ewaybillBaseUrl(config.sandbox);
  const session = await authenticate(baseUrl, config);
  if (!session.ok) return session;

  try {
    const encryptedData = aesEncrypt(session.data.sek, JSON.stringify({ ewbNo, cancelRsnCode: reasonCode, cancelRmrk: remark.slice(0, 100) }));
    const res = await fetch(`${baseUrl}/ewaybillapi/v1.03/ewayapi`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', client_id: config.clientId, client_secret: config.clientSecret, gstin: config.gstin, AuthToken: session.data.authToken },
      body: JSON.stringify({ action: 'CANEWB', Data: encryptedData }),
    });
    if (!res.ok) return { ok: false, error: `NIC e-Way Bill cancel failed: HTTP ${res.status}` };
    const json = await res.json();
    if (json?.Status !== 1) return { ok: false, error: json?.ErrorDetails?.map((e: any) => e.ErrorMessage).join('; ') ?? 'NIC rejected the cancellation' };
    const decrypted = JSON.parse(aesDecrypt(session.data.sek, json.Data));
    return { ok: true, data: { cancelDate: decrypted.cancelDate } };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'NIC e-Way Bill cancellation failed' };
  }
}
