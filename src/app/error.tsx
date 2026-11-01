'use client';

import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

/** Catches anything a page or the app layout throws — e.g. the company row
 * failing to load. In production the real message is hidden; the digest is
 * the id to search for in Vercel's logs. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px] rounded-xl2 border border-line bg-surface p-7 text-center">
        <h1 className="text-[18px] font-extrabold text-ink">This page couldn&apos;t load</h1>
        <p className="mt-2 text-[13px] text-ink-faint">Something went wrong on the server. Try again — if it keeps happening, send the reference below to whoever looks after the app.</p>
        {error.digest && <p className="mt-3 font-mono text-[12px] text-ink-soft">Ref: {error.digest}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="outline" onClick={() => signOut({ callbackUrl: '/login' })}>
            Log out
          </Button>
          <Button onClick={() => retry()}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
