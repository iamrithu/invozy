'use client';

import { useState, useTransition } from 'react';
import { Ban, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';

/** Shared by the e-Invoice and e-Way Bill "Cancel" flows — both need a
 * reason code (NIC's fixed enum) plus a free-text remark before calling
 * their respective cancel action. */
export function CancelReasonDialog({
  open,
  onOpenChange,
  title,
  reasonOptions,
  onConfirm,
  onCancelled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  reasonOptions: { value: string; label: string }[];
  onConfirm: (reasonCode: string, remark: string) => Promise<{ error?: string }>;
  onCancelled: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(undefined);
    startTransition(async () => {
      const result = await onConfirm(String(formData.get('reasonCode') || '1'), String(formData.get('remark') || ''));
      if (result.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
      onCancelled();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban size={16} className="text-destructive" /> {title}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 px-6">
            <Field as="select" label="Reason" name="reasonCode" defaultValue={reasonOptions[0]?.value} options={reasonOptions} />
            <Field label="Remark" name="remark" as="textarea" placeholder="Short reason for cancellation" />
          </div>
          {error && <p className="px-6 text-[12.5px] font-bold text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              <Check size={13} /> {pending ? 'Cancelling…' : 'Cancel it'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
