'use client';

import { cn } from '@/lib/utils';

export type ChipOption<T extends string> = { value: T; label: string; count?: number };

/** A row of pill filters with counts ("Low 4") — the Inventory status chips
 * and the ledger's movement-type chips. Scrolls sideways on a phone instead
 * of wrapping into a tall block. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('-mx-1 flex min-w-0 max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm2 border px-3 text-[12px] font-bold transition-colors',
              active ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-soft hover:border-ink-faint hover:text-ink'
            )}
          >
            {o.label}
            {o.count != null && <span className={cn('font-mono text-[11px]', active ? 'text-surface/80' : 'text-ink-faint')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
