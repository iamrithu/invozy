'use client';

import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

/** The "Include drafts" switch, on the Dashboard and Reports. Off (the
 * default) is the actual position: sent and paid invoices only. On adds the
 * drafts in, so the money reads Overall = Paid + Remaining (drafts +
 * unpaid). With `onChange` the caller keeps the state; without it (the
 * server-rendered Dashboard) it lives in the URL as `?drafts=1` on `path`. */
export function DraftsToggle({ on, onChange, path = '/dashboard' }: { on: boolean; onChange?: (on: boolean) => void; path?: string }) {
  const router = useRouter();
  return (
    <div
      className="flex h-9 items-center gap-2 rounded-sm2 border border-line bg-surface px-3"
      title="Off: sent and paid invoices only. On: drafts added in — Overall = Paid + Remaining (drafts + unpaid)."
    >
      <Switch
        id="include-drafts"
        checked={on}
        onChange={(e) => {
          const next = e.target.checked;
          if (onChange) return onChange(next);
          const params = new URLSearchParams(window.location.search);
          if (next) params.set('drafts', '1');
          else params.delete('drafts');
          const qs = params.toString();
          router.push(qs ? `${path}?${qs}` : path, { scroll: false });
        }}
      />
      <label htmlFor="include-drafts" className="cursor-pointer select-none whitespace-nowrap text-[12.5px] font-bold text-ink-body">
        Include drafts
      </label>
    </div>
  );
}
