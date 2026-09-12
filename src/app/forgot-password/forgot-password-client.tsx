'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { requestPasswordReset } from '@/actions/auth';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

export function ForgotPasswordClient() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPending(true);
    const result = await requestPasswordReset({}, formData);
    setPending(false);
    setMessage(result.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-white shadow-card ring-1 ring-black/5">
            <Image src="/brand/mark.png" alt="Invozy" width={64} height={64} className="h-7 w-7 object-contain" />
          </span>
          <h1 className="text-[19px] font-extrabold text-ink">Reset your password</h1>
          <p className="text-[12.5px] text-ink-faint">Enter the email you signed up with and we&apos;ll send a reset link.</p>
        </div>

        {message ? (
          <div className="flex items-start gap-2.5 rounded-lg2 border border-line bg-bg p-3.5 text-[12.5px] leading-relaxed text-ink-soft">
            <KeyRound size={15} className="mt-0.5 flex-shrink-0 text-brand" />
            <span>{message}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Email" name="identifier" type="email" />
            <Button type="submit" className="w-full justify-center" disabled={pending}>
              {pending ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-[12.5px] text-ink-faint">
          <Link href="/login" className="font-bold text-brand">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
