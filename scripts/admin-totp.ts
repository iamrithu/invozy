/**
 * Sets up two-factor sign-in for the platform admin (/admin/login):
 *
 *   npm run admin-totp
 *
 * Prints a new secret and a QR code. Scan the QR with an authenticator app
 * (Google Authenticator, Authy, 1Password…), then set ADMIN_TOTP_SECRET to
 * the secret in the deployment's environment. From then on the admin login
 * asks for the 6-digit code. Remove the variable to switch it off.
 */
import QRCode from 'qrcode';
import { generateTotpSecret, otpauthUrl } from '../src/lib/totp';

async function main() {
  const secret = generateTotpSecret();
  const url = otpauthUrl(secret, process.env.ADMIN_EMAIL || 'admin', 'Invozy admin');
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`ADMIN_TOTP_SECRET=${secret}\n`);
  console.log('Scan the QR code, then set ADMIN_TOTP_SECRET to the value above (keep it secret — it is the second factor).');
}

main();
