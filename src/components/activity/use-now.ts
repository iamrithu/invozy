'use client';

import { useEffect, useState } from 'react';

/** The current time, re-read every minute so "5 min ago" labels don't go
 * stale while a screen stays open. Text derived from it can differ by a
 * minute between the server render and hydration — render it inside an
 * element with `suppressHydrationWarning`. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
