import type { Metadata } from 'next';
import { ResetPasswordClient } from './reset-password-client';

export const metadata: Metadata = { title: 'Set a new password — Invozy' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetPasswordClient token={token ?? ''} />;
}
