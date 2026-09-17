/** Every NIC call resolves to this instead of throwing, so a sandbox hiccup
 * or missing credentials surfaces as a friendly inline error in the invoice
 * UI (src/actions/gst-compliance.ts) rather than a 500. */
export type NicResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type NicCompanyConfig = {
  sandbox: boolean;
  gstin: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
};

// TODO(nic-sandbox): confirm these against the actual sandbox onboarding
// docs/Postman collection once the company has registered — NIC's e-Invoice
// and e-Way Bill systems are separate portals with separate base URLs, and
// the exact path segments below follow the publicly documented v1.03 API
// shape but haven't been exercised against a live sandbox in this session.
export const NIC_EINVOICE_BASE_URL = {
  sandbox: 'https://einv-apisandbox.nic.in',
  production: 'https://einv-apivn.nic.in', // per-GSP prod host varies; direct-API taxpayers get their own
};
export const NIC_EWAYBILL_BASE_URL = {
  sandbox: 'https://ewbsandbox.gst.gov.in',
  production: 'https://ewaybillgst.gov.in',
};

export function einvoiceBaseUrl(sandbox: boolean) {
  return sandbox ? NIC_EINVOICE_BASE_URL.sandbox : NIC_EINVOICE_BASE_URL.production;
}
export function ewaybillBaseUrl(sandbox: boolean) {
  return sandbox ? NIC_EWAYBILL_BASE_URL.sandbox : NIC_EWAYBILL_BASE_URL.production;
}
