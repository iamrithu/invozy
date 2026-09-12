'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export function LoginClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    setPending(true);
    const result = await signIn('tenant', {
      identifier: String(formData.get('identifier') || ''),
      password: String(formData.get('password') || ''),
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      const message = result.code === 'too-many-attempts' ? 'Too many failed attempts. Try again in a few minutes.' : 'Incorrect email/phone or password.';
      setError(message);
      toast.error(message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-white shadow-card ring-1 ring-black/5">
            <Image src="/brand/mark.png" alt="Invozy" width={64} height={64} className="h-7 w-7 object-contain" />
          </span>
          <h1 className="text-[19px] font-extrabold text-ink">Welcome back</h1>
          <p className="text-[12.5px] text-ink-faint">Log in to your Invozy workspace.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Email or phone" name="identifier" />
          <div>
            <Field label="Password" name="password" type="password" />
            <Link href="/forgot-password" className="mt-1 inline-block text-[11.5px] font-bold text-brand">
              Forgot password?
            </Link>
          </div>

          {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}

          <Button type="submit" className="w-full justify-center" disabled={pending}>
            {pending ? 'Logging in…' : 'Log in'}
          </Button>

          <p className="text-center text-[11px] text-ink-faint">
            By logging in you agree to our{' '}
            <Link href="/terms" target="_blank" className="font-bold text-brand">
              Terms
            </Link>
            .
          </p>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-ink-faint">
          Don&apos;t have a workspace yet?{' '}
          <Link href="/signup" className="font-bold text-brand">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
