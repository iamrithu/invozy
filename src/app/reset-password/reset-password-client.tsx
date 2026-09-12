'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { resetPassword } from '@/actions/auth';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

export function ResetPasswordClient({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('token', token);
    setError(undefined);
    setPending(true);
    const result = await resetPassword({}, formData);
    setPending(false);
    if (result.error) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => router.push('/login'), 2000);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-white shadow-card ring-1 ring-black/5">
            <Image src="/brand/mark.png" alt="Invozy" width={64} height={64} className="h-7 w-7 object-contain" />
          </span>
          <h1 className="text-[19px] font-extrabold text-ink">Set a new password</h1>
          <p className="text-[12.5px] text-ink-faint">Choose a new password for your Invozy workspace.</p>
        </div>

        {!token ? (
          <p className="text-center text-[12.5px] font-bold text-destructive">
            This link is missing its reset token. Request a new one from{' '}
            <Link href="/forgot-password" className="text-brand">
              here
            </Link>
            .
          </p>
        ) : done ? (
          <div className="flex items-start gap-2.5 rounded-lg2 border border-line bg-bg p-3.5 text-[12.5px] leading-relaxed text-ink-soft">
            <CheckCircle2 size={15} className="mt-0.5 flex-shrink-0 text-green" />
            <span>Password updated — taking you to log in…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="New password" name="password" type="password" />
            {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}
            <Button type="submit" className="w-full justify-center" disabled={pending}>
              {pending ? 'Saving…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
