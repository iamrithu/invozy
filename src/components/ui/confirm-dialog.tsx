'use client';

import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Yes/no confirmation. Callers keep `open` in their own state and close it
 * themselves in onConfirm — on failure as well as success, so a refused
 * delete never leaves the dialog sitting open with a spinner-less button.
 * `icon`/`confirmIcon` let one dialog swap meaning mid-flow (e.g. a blocked
 * customer delete turning into "Disable customer"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  pending = false,
  onConfirm,
  icon: Icon = AlertTriangle,
  confirmIcon: ConfirmIcon,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  icon?: LucideIcon;
  confirmIcon?: LucideIcon;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 pr-6">
            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm2 ${destructive ? 'bg-red-soft text-red' : 'bg-surface-alt text-ink-soft'}`}>
              <Icon size={15} />
            </span>
            <span className="min-w-0">{title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-[13px] leading-relaxed text-ink-body">{description}</div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={pending}>
            {ConfirmIcon && !pending && <ConfirmIcon size={13} />}
            {pending ? 'Please wait…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
