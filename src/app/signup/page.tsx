import type { Metadata } from 'next';
import { SignupClient } from './signup-client';

export const metadata: Metadata = { title: 'Sign up — Invozy' };

export default function SignupPage() {
  return <SignupClient />;
}
