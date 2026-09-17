import QRCode from 'qrcode';

/** Renders the NIC-signed e-Invoice QR payload (Invoice.signedQrCode) to a
 * PNG data URL, server-side — the payload can run to 1000+ characters
 * (RSA-signed JSON), so this always lets `qrcode` pick a high-enough
 * version/error-correction level rather than fixing one in advance. */
export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 1, width: 180 });
}
