import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/session';
import { APP_NAME } from '@/lib/brand';
import { AdminLoginClient } from './admin-login-client';

export const metadata: Metadata = { title: `Admin login — ${APP_NAME}` };

export default async function AdminLoginPage() {
  // Already signed in as the admin — straight to the panel.
  if (await requireSuperAdmin().catch(() => null)) redirect('/admin');
  return <AdminLoginClient twoFactor={!!process.env.ADMIN_TOTP_SECRET} />;
}
