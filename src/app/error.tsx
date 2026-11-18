'use client';

import { PageError } from '@/components/shell/page-error';

/** Catches anything a page or the app layout throws — e.g. the company row
 * failing to load. In production the real message is hidden; the digest is
 * the id to search for in Vercel's logs. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError error={error} retry={retry} />;
}
