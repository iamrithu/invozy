'use client';

import { PageError } from '@/components/shell/page-error';

/** A page inside the app failed: show it within the shell (sidebar and top
 * bar stay usable) instead of replacing the whole screen. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageError error={error} retry={retry} compact />;
}
