'use client';

import { useEffect, useState } from 'react';
import { Check, Contact, Home, IdCard, Mail, Phone, Sparkles, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StateSelect } from '@/components/ui/location-field';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetIcon, SheetTitle } from '@/components/ui/sheet';
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/use-suppliers';
import type { SupplierOption, SupplierRow } from '@/actions/suppliers';

/** Add/edit a supplier. The state matters: it decides whether a bill from
 * this supplier carries IGST or CGST+SGST, so it defaults to the company's
 * own state (most suppliers are local) rather than being left blank.
 * `onSaved` hands a new supplier back — the purchase form uses it to select
 * the supplier it just added. */
export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  defaultState,
  prefillName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: SupplierRow | null;
  defaultState: string;
  prefillName?: string;
  onSaved?: (supplier: SupplierOption) => void;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const [state, setState] = useState(supplier?.state || defaultState);
  const [error, setError] = useState<string | undefined>();
  const pending = create.isPending || update.isPending;

  // Reset on open — keyed on the id, not the object, so a background
  // refetch of the list can't undo a state picked mid-edit.
  useEffect(() => {
    if (!open) return;
    setState(supplier?.state || defaultState);
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id, defaultState]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = {
      name: String(f.get('name') ?? ''),
      contact: String(f.get('contact') ?? ''),
      phone: String(f.get('phone') ?? ''),
      email: String(f.get('email') ?? ''),
      gstin: String(f.get('gstin') ?? ''),
      state,
      address: String(f.get('address') ?? ''),
    };
    setError(undefined);
    try {
      if (supplier) {
        await update.mutateAsync({ id: supplier.id, input });
        toast.success('Supplier saved');
      } else {
        const res = await create.mutateAsync(input);
        toast.success(`Added ${input.name}`);
        if (res.supplier) onSaved?.(res.supplier);
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {/* Keyed so reopening for a different supplier resets the
            uncontrolled fields' defaults. */}
        <form key={`${supplier?.id ?? 'new'}-${open}`} onSubmit={submit} className="contents">
          <SheetHeader>
            <SheetIcon>{supplier ? <Truck size={16} /> : <Sparkles size={16} />}</SheetIcon>
            <div className="min-w-0 flex-1">
              <SheetTitle>{supplier ? supplier.name : 'New supplier'}</SheetTitle>
              <p className="text-[11.5px] text-ink-faint">{supplier ? 'Edit supplier details' : 'Who you buy stock from'}</p>
            </div>
          </SheetHeader>
          <SheetBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Name" name="name" icon={Truck} defaultValue={supplier?.name ?? prefillName ?? ''} required />
              </div>
              <Field label="Contact person (optional)" name="contact" icon={Contact} defaultValue={supplier?.contact ?? ''} />
              <Field label="Phone (optional)" name="phone" icon={Phone} defaultValue={supplier?.phone ?? ''} />
              <Field label="Email (optional)" name="email" icon={Mail} defaultValue={supplier?.email ?? ''} />
              <Field label="GSTIN (optional)" name="gstin" icon={IdCard} mono defaultValue={supplier?.gstin ?? ''} />
              <div className="sm:col-span-2">
                <StateSelect name="state" value={state} onChange={setState} />
                <p className="mt-1 text-[11px] text-ink-faint">A supplier in another state bills IGST; one in your state bills CGST + SGST.</p>
              </div>
              <div className="sm:col-span-2">
                <Field label="Address (optional)" name="address" as="textarea" icon={Home} defaultValue={supplier?.address ?? ''} />
              </div>
            </div>
            {error && <p className="mt-3 text-[12.5px] font-bold text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter className="justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              <Check size={13} /> {pending ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
