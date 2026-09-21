import QRCode from 'qrcode';

/** Renders the NIC-signed e-Invoice QR payload (Invoice.signedQrCode) to a
 * PNG data URL, server-side — the payload can run to 1000+ characters
 * (RSA-signed JSON), so this always lets `qrcode` pick a high-enough
 * version/error-correction level rather than fixing one in advance.
 *
 * Returns null (rather than throwing) if the payload can't be encoded —
 * e.g. it exceeds what's representable at this error-correction level.
 * The invoice PDF/detail page is expected to still render without the QR
 * image rather than fail outright over one unencodable code. */
export async function qrDataUrl(payload: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 180 });
  } catch (e) {
    console.error('qrDataUrl: failed to encode e-Invoice QR payload', e);
    return null;
  }
}

/** Builds the standard UPI deep-link URI (`upi://pay?...`) that any UPI app
 * (GPay, PhonePe, Paytm, etc.) recognises when scanned — `pa` (payee
 * address) is the company's UPI ID, `pn` (payee name) is shown to the payer
 * before they confirm. No amount (`am`) is included on purpose: this QR is
 * meant to be reusable across every invoice from this company, not
 * regenerated per amount. Returns null when there's no UPI ID to encode. */
export async function upiQrDataUrl(upiId: string | null | undefined, payeeName: string): Promise<string | null> {
  const vpa = upiId?.trim();
  if (!vpa) return null;
  const uri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(payeeName)}`;
  return qrDataUrl(uri);
}
