'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { AlertTriangle, RefreshCw, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A model the running server doesn't know: the database client was
 * regenerated (new tables) but `next dev` is still running the old one. */
function staleClient(message: string | undefined): boolean {
  return process.env.NODE_ENV === 'development' && /Cannot read properties of undefined \(reading '(findMany|findFirst|findUnique|count|create|update|aggregate|groupBy|upsert|delete)'\)/.test(message ?? '');
}

/** What a page shows when it fails to load. Inside the app it sits in the
 * normal shell, so the sidebar still works. */
export function PageError({ error, retry, compact }: { error: Error & { digest?: string }; retry: () => void; compact?: boolean }) {
  const stale = staleClient(error.message);
  return (
    <div className={compact ? 'flex justify-center px-2 py-10' : 'flex min-h-screen items-center justify-center bg-bg px-4 py-10'}>
      <div className="w-full max-w-[440px] overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
        <div className="flex items-center gap-3 border-b border-line bg-brand-light/60 px-5 py-4">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md2 bg-surface text-brand shadow-card">
            {stale ? <TerminalSquare size={17} /> : <AlertTriangle size={17} />}
          </span>
          <div>
            <h1 className="text-[15px] font-extrabold text-ink">{stale ? 'Restart the dev server' : 'This page couldn’t load'}</h1>
            <p className="text-[12px] text-ink-soft">{stale ? 'The database changed since it started.' : 'Something went wrong on the server.'}</p>
          </div>
        </div>
        <div className="px-5 py-4 text-[12.5px] leading-relaxed text-ink-body">
          {stale ? (
            <>
              <p>New tables were added, but the running <code className="rounded-sm2 bg-surface-alt px-1 font-mono text-[11.5px]">next dev</code> still has the old database client loaded.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>In the terminal running it, press Ctrl+C.</li>
                <li>
                  Run <code className="rounded-sm2 bg-surface-alt px-1 font-mono text-[11.5px]">npm run dev</code> again, then reload this page.
                </li>
              </ol>
            </>
          ) : (
            <p>Try again. If it keeps happening, send the reference below to whoever looks after the app.</p>
          )}
          {error.digest && !stale && <p className="mt-3 font-mono text-[11.5px] text-ink-faint">Ref: {error.digest}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          {compact ? (
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            // Outside the app shell the cause can be the login itself.
            <Button variant="outline" onClick={() => signOut({ callbackUrl: '/login' })}>
              Log out
            </Button>
          )}
          <Button onClick={() => retry()}>
            <RefreshCw size={13} /> Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
