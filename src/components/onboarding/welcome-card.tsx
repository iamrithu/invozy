'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Compass, Package, Users, Receipt } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { completeOnboarding } from '@/actions/onboarding';
import { useAppDispatch } from '@/lib/redux/hooks';
import { requestTour } from '@/lib/redux/ui-slice';

// Mirrors (but doesn't share code with) the dashboard's GettingStarted
// component (src/app/(app)/dashboard/page.tsx) and the landing page's "How
// it works" section — same three-step pitch, kept in sync by hand.
const STEPS = [
  { icon: Package, label: 'Add a product' },
  { icon: Users, label: 'Add a customer' },
  { icon: Receipt, label: 'Bill in under a minute' },
];

/** The one-time first-login moment — shown instead of the tour silently
 * auto-starting. Gives the user an explicit choice: take the guided tour, or
 * dismiss and explore on their own. Either path (and a plain dialog dismiss)
 * marks onboarding complete via the same server action the tour itself
 * calls, so this never shows again; "Replay tour" in the account menu
 * remains the one, permanent way back into the tour regardless. */
export function WelcomeCard({ show, companyName }: { show: boolean; companyName: string }) {
  const [open, setOpen] = useState(show);
  const dispatch = useAppDispatch();

  function dismiss() {
    setOpen(false);
    completeOnboarding();
  }

  function takeTour() {
    dispatch(requestTour());
    dismiss();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="max-w-[420px] text-center">
        <span className="mx-auto flex h-14 w-14 animate-bump items-center justify-center rounded-sm2 bg-white shadow-card ring-1 ring-black/5">
          <Image src="/brand/mark.png" alt="Invozy" width={64} height={64} className="h-9 w-9 object-contain" />
        </span>
        <h2 className="mt-1 text-[19px] font-extrabold text-ink">Welcome to Invozy, {companyName}!</h2>
        <p className="mx-auto mt-1 max-w-[320px] text-[13px] leading-relaxed text-ink-soft">
          GST billing that gets out of your way — add a product, add a customer, and send a GST-correct invoice in under a minute.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center gap-1.5 rounded-lg2 border border-line bg-bg p-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-light text-[11px] font-extrabold text-brand-dark">{i + 1}</span>
              <s.icon size={15} className="text-brand" />
              <span className="text-[10.5px] font-bold leading-tight text-ink-soft">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={takeTour} className="justify-center">
            <Compass size={15} /> Take the guided tour
          </Button>
          <Button onClick={dismiss} variant="outline" className="justify-center">
            I&apos;ll explore on my own
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
