import { createCipheriv, createDecipheriv, publicEncrypt, constants, randomBytes } from 'crypto';

// TODO(nic-sandbox): NIC's e-Invoice/e-Way Bill API encrypts the auth
// handshake with RSA (the taxpayer's app-key + password, using NIC's public
// key certificate returned by the auth-key endpoint) and encrypts every
// subsequent request/response body with AES using the session key (Sek)
// that handshake returns. This module implements that standard shape
// (RSA PKCS1 for the handshake, AES-256-ECB/PKCS5 for payloads, per the
// widely-documented NIC e-Invoice API v1.03 contract) — verify the exact
// padding/mode against the sandbox's own spec once registered; a mismatch
// here would surface as a decrypt failure, not a silent wrong answer.

export function rsaEncrypt(publicKeyPem: string, plain: string): string {
  const buf = publicEncrypt({ key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(plain, 'utf8'));
  return buf.toString('base64');
}

export function aesEncrypt(base64Key: string, plain: string): string {
  const key = Buffer.from(base64Key, 'base64');
  const cipher = createCipheriv('aes-256-ecb', key, null);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ciphertext.toString('base64');
}

export function aesDecrypt(base64Key: string, base64Ciphertext: string): string {
  const key = Buffer.from(base64Key, 'base64');
  const decipher = createDecipheriv('aes-256-ecb', key, null);
  const plain = Buffer.concat([decipher.update(Buffer.from(base64Ciphertext, 'base64')), decipher.final()]);
  return plain.toString('utf8');
}

export function randomAppKey(): string {
  return randomBytes(32).toString('base64');
}
