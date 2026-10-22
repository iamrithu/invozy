import type { Metadata } from 'next';
import { ResetPasswordClient } from './reset-password-client';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Set a new password — ${APP_NAME}` };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token ?? ''} />;
}
