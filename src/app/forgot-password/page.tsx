import type { Metadata } from 'next';
import { ForgotPasswordClient } from './forgot-password-client';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: `Reset your password — ${APP_NAME}` };

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
