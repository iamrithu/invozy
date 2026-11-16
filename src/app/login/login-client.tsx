'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BrandMark } from '@/components/shell/brand-mark';
import { APP_NAME } from '@/lib/brand';

export function LoginClient() {
  const router = useRouter();
  // Cached queries aren't keyed by company — drop them all on every sign-in
  // so nothing from a previous login on this browser can be shown.
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    setPending(true);
    const result = await signIn('credentials', {
      identifier: String(formData.get('identifier') || ''),
      password: String(formData.get('password') || ''),
      redirect: false,
    });
    if (result?.error) {
      setPending(false);
      const message =
        result.code === 'too-many-attempts'
          ? 'Too many failed attempts. Try again in a few minutes.'
          : result.code === 'company-suspended'
            ? 'This company account is suspended. Contact support to restore access.'
            : 'Incorrect email/phone or password.';
      setError(message);
      toast.error(message);
      return;
    }
    // Left `pending` true here on purpose — this page's server-rendered
    // dashboard fetch (router.refresh() below) takes a beat, and resetting
    // the button back to its idle "Log in" label right before that gap
    // looked like the whole screen had frozen, with zero feedback until the
    // route actually swapped in. Staying in the loading state through the
    // navigation removes that dead zone; there's nothing left to reset it
    // since this component unmounts once the new route lands.
    queryClient.clear();
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <BrandMark className="h-11 w-11 text-[14px] shadow-card" />
          <h1 className="text-[19px] font-extrabold text-ink">Welcome back</h1>
          <p className="text-[12.5px] text-ink-faint">Log in to continue.</p>
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
        </form>

        <p className="mt-5 text-center text-[12px] text-ink-faint">
          New to {APP_NAME}?{' '}
          <Link href="/signup" className="font-bold text-brand">
            Create a company account
          </Link>
        </p>
      </div>
    </div>
  );
}
