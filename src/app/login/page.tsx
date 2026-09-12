import type { Metadata } from 'next';
import { LoginClient } from './login-client';

export const metadata: Metadata = { title: 'Log in — Invozy' };

export default function LoginPage() {
  return <LoginClient />;
}
