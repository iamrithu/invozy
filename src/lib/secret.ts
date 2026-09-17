import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * At-rest encryption for per-tenant third-party API secrets (NIC e-Invoice/
 * e-Way Bill username/password, client secret — see Company.nicPasswordEnc/
 * nicClientSecretEnc). Reuses AUTH_SECRET (already required for NextAuth
 * session signing) as the key source via scrypt, so no new secret needs to
 * be provisioned or rotated separately.
 *
 * Format: `${ivHex}:${authTagHex}:${ciphertextHex}` — AES-256-GCM, random IV
 * per call.
 */
function deriveKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET must be set to encrypt/decrypt stored credentials.');
  return scryptSync(secret, 'invozy-nic-credentials', 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptSecret(enc: string): string {
  const [ivHex, authTagHex, ciphertextHex] = enc.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('Malformed encrypted secret.');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plain.toString('utf8');
}
