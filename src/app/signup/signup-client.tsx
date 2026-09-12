'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { toast } from 'sonner';
import { signUp } from '@/actions/auth';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { StateSelect } from '@/components/ui/location-field';

export function SignupClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [selectedState, setSelectedState] = useState('Tamil Nadu');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = String(formData.get('password') || '');
    setError(undefined);
    setFieldErrors({});
    setPending(true);

    const result = await signUp({}, formData);
    if (result.error || !result.identifier) {
      setPending(false);
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      if (result.error) toast.error(result.error);
      return;
    }

    const signInResult = await signIn('tenant', { identifier: result.identifier, password, redirect: false });
    setPending(false);
    if (signInResult?.error) {
      toast.success('Account created — please log in.');
      router.push('/login');
      return;
    }
    toast.success('Welcome to Invozy!');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-[420px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-white shadow-card ring-1 ring-black/5">
            <Image src="/brand/mark.png" alt="Invozy" width={64} height={64} className="h-7 w-7 object-contain" />
          </span>
          <h1 className="text-[19px] font-extrabold text-ink">Create your workspace</h1>
          <p className="text-[12.5px] text-ink-faint">Set up your company and start billing in a minute.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Company name" name="companyName" error={fieldErrors.companyName} />
          <StateSelect name="state" value={selectedState} onChange={setSelectedState} />
          <Field label="Email" name="email" type="email" error={fieldErrors.email} />
          <Field label="Phone (optional if email given)" name="phone" error={fieldErrors.phone} />
          <Field label="Password" name="password" type="password" error={fieldErrors.password} />

          {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}

          <label className="flex items-start gap-2 text-[11.5px] text-ink-soft">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-sm2 border-line accent-brand"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="font-bold text-brand">
                Terms &amp; Conditions
              </Link>
            </span>
          </label>

          <Button type="submit" className="w-full justify-center" disabled={pending || !agreed}>
            {pending ? 'Creating your workspace…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-4 text-center text-[12.5px] text-ink-faint">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-brand">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
