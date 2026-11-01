/** The Company row minus its encrypted NIC credentials — what may be sent to
 * a client component. The ciphertexts are useless without AUTH_SECRET, but
 * they still have no business in the browser; the company form only needs
 * to know whether each one is already saved. */
export function toPublicCompany<T extends { nicPasswordEnc?: string | null; nicClientSecretEnc?: string | null }>(company: T) {
  const { nicPasswordEnc, nicClientSecretEnc, ...rest } = company;
  return { ...rest, nicPasswordSaved: !!nicPasswordEnc, nicClientSecretSaved: !!nicClientSecretEnc };
}
