'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme-toggle';

export function AdminLoginClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    setPending(true);
    const result = await signIn('admin', {
      email: String(formData.get('email') || ''),
      password: String(formData.get('password') || ''),
      redirect: false,
    });
    setPending(false);
    if (result?.error) {
      const message = result.code === 'too-many-attempts' ? 'Too many failed attempts. Try again in a few minutes.' : 'Incorrect email or password.';
      setError(message);
      toast.error(message);
      return;
    }
    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-chrome px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-[380px] rounded-xl2 border border-line bg-surface p-7 shadow-elevated">
        <div className="mb-6 flex flex-col items-center gap-2.5 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-sm2 bg-brand text-white">
            <ShieldCheck size={20} />
          </span>
          <h1 className="text-[19px] font-extrabold text-ink">Platform admin</h1>
          <p className="text-[12.5px] text-ink-faint">Manage every company on Invozy.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Email" name="email" type="email" />
          <Field label="Password" name="password" type="password" />

          {error && <p className="text-[12.5px] font-bold text-destructive">{error}</p>}

          <Button type="submit" className="w-full justify-center" disabled={pending}>
            {pending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
