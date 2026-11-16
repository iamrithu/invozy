'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CheckCircle2, Circle, X, Compass, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { dismissSetupChecklist, markSetupItem } from '@/actions/onboarding';
import { useAppDispatch } from '@/lib/redux/hooks';
import { requestTour } from '@/lib/redux/ui-slice';
import type { Checklist } from '@/lib/setup-checklist';

/** "Get set up" — the dashboard card for a new company (src/lib/setup-checklist.ts). */
export function SetupChecklist({ initial }: { initial: Checklist }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  const pct = Math.round((initial.done / initial.total) * 100);

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    start(async () => {
      const res = await action();
      if (res.error) toast.error(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <section data-tour="setup-checklist" className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold text-ink">Get set up</h2>
          <p className="mt-0.5 text-[12px] text-ink-faint">
            {initial.done} of {initial.total} done — finish these and your invoices are ready to go.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => dispatch(requestTour())} className="flex items-center gap-1.5 rounded-md2 border border-line px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:text-ink">
            <Compass size={13} /> Take the tour
          </button>
          <button type="button" aria-label="Hide the setup checklist" disabled={pending} onClick={() => run(dismissSetupChecklist, () => setHidden(true))} className="rounded-md2 p-1.5 text-ink-faint hover:bg-surface-alt hover:text-ink">
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-alt">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {initial.items.map((item) => (
          <li key={item.key} className={clsx('flex items-center gap-2.5 rounded-lg2 border px-3 py-2', item.done ? 'border-transparent bg-bg' : 'border-line')}>
            {item.done ? <CheckCircle2 size={16} className="flex-shrink-0 text-green" /> : <Circle size={16} className="flex-shrink-0 text-ink-faint" />}
            <div className="min-w-0 flex-1">
              <div className={clsx('truncate text-[12.5px] font-bold', item.done ? 'text-ink-faint line-through' : 'text-ink')}>{item.label}</div>
              {!item.done && <div className="truncate text-[11px] text-ink-faint">{item.hint}</div>}
            </div>
            {!item.done && item.canMark && (
              <button type="button" disabled={pending} onClick={() => run(() => markSetupItem(item.key))} className="flex-shrink-0 text-[11px] font-bold text-ink-faint hover:text-ink">
                {item.key === 'gstin' ? 'Not registered' : 'Skip'}
              </button>
            )}
            {!item.done && (
              <Link href={item.href} className="flex flex-shrink-0 items-center text-[12px] font-bold text-brand">
                Go <ChevronRight size={13} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
