'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { setMonthlySalesTarget } from '@/actions/settings';
import { useCurrentUser } from '@/components/current-user';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fmtInr } from '@/lib/gst';
import { cn } from '@/lib/utils';

/** The month's net sales against the owner's target: how far along, and
 * whether the current pace gets there — "₹4,120 a day needed for the last
 * 14 days" is more useful than a bare percentage. */
export function SalesTarget({ target, netSales, days, currency }: { target: number | null; netSales: number; days: { elapsed: number; total: number }; currency: string }) {
  const { isOwner } = useCurrentUser();
  const [open, setOpen] = useState(false);

  if (!target) {
    return isOwner ? (
      <>
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-[11.5px] font-bold text-brand hover:underline">
          <Target size={12} /> Set a monthly sales target
        </button>
        <TargetDialog open={open} onOpenChange={setOpen} current={null} />
      </>
    ) : null;
  }

  const pct = Math.min((netSales / target) * 100, 999);
  const left = Math.max(target - netSales, 0);
  const daysLeft = days.total - days.elapsed + 1; // today still counts
  const projected = days.elapsed > 0 ? (netSales / days.elapsed) * days.total : 0;
  const onPace = projected >= target;
  const reached = netSales >= target;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-semibold text-ink-soft">
          {Math.round(pct)}% of {fmtInr(target, currency)} target
        </span>
        {isOwner && (
          <button type="button" onClick={() => setOpen(true)} className="font-bold text-brand hover:underline">
            Edit
          </button>
        )}
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt"
        role="progressbar"
        aria-label="Monthly sales target"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(pct, 100))}
      >
        <div className={cn('h-full rounded-full', reached || onPace ? 'bg-green' : 'bg-gold')} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-ink-faint">
        {reached
          ? `Target reached — ${fmtInr(netSales - target, currency)} over.`
          : `${fmtInr(left / Math.max(daysLeft, 1), currency)} a day needed for the last ${daysLeft} day${daysLeft === 1 ? '' : 's'} · ${onPace ? 'on pace' : `pace points to ${fmtInr(projected, currency)}`}`}
      </div>
      <TargetDialog open={open} onOpenChange={setOpen} current={target} />
    </div>
  );
}

function TargetDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (v: boolean) => void; current: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ? String(current) : '');
  const [pending, start] = useTransition();

  function save(amount: number | null) {
    start(async () => {
      const res = await setMonthlySalesTarget(amount);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(amount ? `Monthly target set to ${fmtInr(amount)}` : 'Monthly target cleared');
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target size={16} className="text-brand" /> Monthly sales target
          </DialogTitle>
        </DialogHeader>
        <form
          id="target-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseFloat(value);
            if (!(n > 0)) {
              toast.error('Enter a target above zero, or clear it.');
              return;
            }
            save(n);
          }}
          className="space-y-2"
        >
          <label htmlFor="target-amount" className="text-[12px] font-semibold text-ink-soft">
            Net sales to reach each month (₹, before GST adjustments)
          </label>
          <input
            id="target-amount"
            type="number"
            inputMode="decimal"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 100000"
            className="w-full rounded-sm2 border border-line bg-surface px-3 py-2 font-mono text-[14px] outline-none focus:border-brand"
            autoFocus
          />
          <p className="text-[11.5px] text-ink-faint">The dashboard shows progress and the daily pace needed to get there.</p>
        </form>
        <DialogFooter>
          {current && (
            <Button variant="ghost" onClick={() => save(null)} disabled={pending} className="mr-auto">
              Clear target
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="target-form" disabled={pending}>
            {pending ? 'Saving…' : 'Save target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
