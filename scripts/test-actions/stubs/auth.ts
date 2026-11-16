// Stand-in for next-auth's auth(): the session is whoever run.ts sets as
// `__TEST_USER`, carrying companyId exactly as the real JWT does — so
// src/lib/tenant.ts resolves the company the same way it does in the app. A
// SUPER_ADMIN test user gets the current admin-credential fingerprint.
import { adminFingerprint } from '@/lib/admin-fingerprint';

type TestUser = { id: string; role: 'OWNER' | 'STAFF' | 'SUPER_ADMIN'; companyId?: string };

export async function auth() {
  const u = (globalThis as { __TEST_USER?: TestUser }).__TEST_USER;
  if (!u) return null;
  if (u.role === 'SUPER_ADMIN') return { user: { id: 'super-admin', role: 'SUPER_ADMIN', email: process.env.ADMIN_EMAIL, adminFp: adminFingerprint() } };
  return { user: { id: u.id, role: u.role, companyId: u.companyId } };
}
