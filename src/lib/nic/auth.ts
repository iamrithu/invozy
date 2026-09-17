import { rsaEncrypt, aesDecrypt, randomAppKey } from './crypto';
import type { NicResult, NicCompanyConfig } from './types';

type Session = { sek: string; authToken: string; expiresAt: number };

// In-memory only — NIC sessions are valid for hours, and re-authenticating
// on a cold start (server restart/redeploy) is cheap and always safe. Keyed
// by `${baseUrl}:${gstin}` so e-Invoice and e-Way Bill (different base URLs,
// separate auth) never collide.
const sessions = new Map<string, Session>();

/**
 * Shared NIC authenticate handshake — RSA-encrypt (password, a fresh AES
 * AppKey) with NIC's public key, POST to /auth, then AES-decrypt the
 * returned session key (Sek) using that same AppKey. See crypto.ts for the
 * TODO(nic-sandbox) caveat on the exact padding/mode.
 */
export async function authenticate(baseUrl: string, config: NicCompanyConfig): Promise<NicResult<Session>> {
  const cacheKey = `${baseUrl}:${config.gstin}`;
  const cached = sessions.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return { ok: true, data: cached };

  try {
    // Step 1 — fetch NIC's public key for this taxpayer/session.
    const keyRes = await fetch(`${baseUrl}/eivital/v1.03/auth`, {
      method: 'GET',
      headers: {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        gstin: config.gstin,
        username: config.username,
      },
    });
    if (!keyRes.ok) return { ok: false, error: `NIC auth (public key) failed: HTTP ${keyRes.status}` };
    const keyJson = await keyRes.json();
    const publicKeyPem: string | undefined = keyJson?.Data?.Rek ?? keyJson?.data?.rek;
    if (!publicKeyPem) return { ok: false, error: 'NIC auth: no public key returned (unexpected sandbox response shape — see TODO(nic-sandbox) in src/lib/nic/auth.ts)' };

    // Step 2 — RSA-encrypt password + a fresh AES AppKey, POST for a session.
    const appKey = randomAppKey();
    const encryptedPassword = rsaEncrypt(publicKeyPem, config.password);
    const encryptedAppKey = rsaEncrypt(publicKeyPem, appKey);

    const authRes = await fetch(`${baseUrl}/eivital/v1.03/auth`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        gstin: config.gstin,
        username: config.username,
      },
      body: JSON.stringify({ UserName: config.username, Password: encryptedPassword, AppKey: encryptedAppKey, ForceRefreshAccessToken: false }),
    });
    if (!authRes.ok) return { ok: false, error: `NIC authenticate failed: HTTP ${authRes.status}` };
    const authJson = await authRes.json();
    if (authJson?.Status !== 1) return { ok: false, error: authJson?.ErrorDetails?.[0]?.ErrorMessage ?? 'NIC authenticate rejected the request' };

    const authToken: string | undefined = authJson.Data?.AuthToken;
    const encryptedSek: string | undefined = authJson.Data?.Sek;
    const expiryMinutes: number = authJson.Data?.TokenExpiry ?? 360;
    if (!authToken || !encryptedSek) return { ok: false, error: 'NIC authenticate: missing AuthToken/Sek in response' };

    const sek = aesDecrypt(appKey, encryptedSek);
    const session: Session = { sek, authToken, expiresAt: Date.now() + expiryMinutes * 60_000 };
    sessions.set(cacheKey, session);
    return { ok: true, data: session };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'NIC authenticate failed' };
  }
}
