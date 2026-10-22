import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/session';
import { LoginClient } from './login-client';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Log in — ${APP_NAME}` };

export default async function LoginPage() {
  // Already signed in (and the user still exists) — skip the login screen.
  // Done here rather than in the proxy, which can't see the database.
  const user = await requireUser().catch(() => null);
  if (user) redirect('/dashboard');
  return <LoginClient />;
}
