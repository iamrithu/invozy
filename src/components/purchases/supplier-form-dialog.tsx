'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, FormGrid, FormSection, FormSheet, Initials, Tag, selectClass, submitIntent, type FormValues } from '@/components/ui/form-sheet';
import { GstinStatus, STATE_NAMES, checkGstin } from '@/components/ui/location-field';
import { cn } from '@/lib/utils';
import { useCreateSupplier, useUpdateSupplier } from '@/hooks/use-suppliers';
import type { SupplierOption, SupplierRow } from '@/actions/suppliers';

/** Add/edit a supplier. The state matters: it decides whether a bill from
 * this supplier carries IGST or CGST+SGST, so it defaults to the company's
 * own state (most suppliers are local) rather than being left blank — and
 * a complete GSTIN fills it in. `onSaved` hands a new supplier back — the
 * purchase form uses it to select the supplier it just added. */
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
  const [formKey, setFormKey] = useState(0);
  const [values, setValues] = useState<FormValues>({});
  const [state, setState] = useState(supplier?.state || defaultState);
  const [gstin, setGstin] = useState(supplier?.gstin ?? '');
  const [error, setError] = useState<string | undefined>();
  const pending = create.isPending || update.isPending;

  // Reset on open — keyed on the id, not the object, so a background
  // refetch of the list can't undo a state picked mid-edit.
  useEffect(() => {
    if (!open) return;
    setState(supplier?.state || defaultState);
    setGstin(supplier?.gstin ?? '');
    setError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id, defaultState]);

  function onGstinChange(next: string) {
    setGstin(next);
    const { valid, state: fromGstin } = checkGstin(next);
    if (valid && fromGstin) setState(fromGstin);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const intent = submitIntent(e);
    const f = new FormData(e.currentTarget);
    const input = {
      name: String(f.get('name') ?? ''),
      contact: String(f.get('contact') ?? ''),
      phone: String(f.get('phone') ?? ''),
      email: String(f.get('email') ?? ''),
      gstin,
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
        if (intent === 'another') {
          setState(defaultState);
          setGstin('');
          setFormKey((k) => k + 1);
          return;
        }
        if (res.supplier) onSaved?.(res.supplier);
      }
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const name = values.name?.trim() ?? '';
  const gst = checkGstin(gstin);
  const local = state === defaultState;
  const sections = [
    { id: 'contact', label: 'Contact', done: !!name },
    { id: 'gst', label: 'GST & address', done: !!state && (!gstin.trim() || gst.valid) },
  ];

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      icon={supplier ? <Truck size={18} /> : <Sparkles size={18} />}
      title={supplier ? 'Edit supplier' : 'New supplier'}
      subtitle={supplier ? `Suppliers · ${supplier.name}` : 'Suppliers · who you buy stock from'}
      // Remount per supplier so the uncontrolled fields pick up its values.
      formKey={`${supplier?.id ?? 'new'}-${formKey}`}
      onValues={setValues}
      onSubmit={submit}
      sections={sections}
      preview={{
        caption: 'how it shows on a purchase bill',
        content: (
          <div className="flex items-center gap-3">
            <Initials name={name || '?'} />
            <div className="min-w-0 flex-1">
              <div className={cn('truncate text-[14px] font-bold', name ? 'text-ink' : 'text-ink-faint')}>{name || 'Supplier name'}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-soft">{[values.contact?.trim(), values.phone?.trim(), state].filter(Boolean).join(' · ')}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gst.valid ? <Tag tone="green">GST registered · input tax claimable</Tag> : <Tag>No GSTIN · no input tax</Tag>}
                {state && <Tag>{local ? 'CGST + SGST' : 'IGST'}</Tag>}
              </div>
            </div>
          </div>
        ),
      }}
      submitLabel={supplier ? 'Save changes' : 'Save supplier'}
      pending={pending}
      addAnother={!supplier && !onSaved}
      error={error}
    >
      <FormSection id="contact" n={1} title="Contact" aside="Only the name is required" done={sections[0].done}>
        <FormGrid>
          <FormField label="Name" required htmlFor="sup-name" span={3}>
            <Input id="sup-name" name="name" defaultValue={supplier?.name ?? prefillName ?? ''} placeholder="e.g. Cream Magic Distributors" autoComplete="off" />
          </FormField>
          <FormField label="Contact person" optional htmlFor="sup-contact" span={3}>
            <Input id="sup-contact" name="contact" defaultValue={supplier?.contact ?? ''} autoComplete="off" />
          </FormField>
          <FormField label="Phone" optional htmlFor="sup-phone" span={3}>
            <Input id="sup-phone" name="phone" type="tel" inputMode="tel" defaultValue={supplier?.phone ?? ''} placeholder="98400 12345" className="font-mono" />
          </FormField>
          <FormField label="Email" optional htmlFor="sup-email" span={3}>
            <Input id="sup-email" name="email" type="email" inputMode="email" defaultValue={supplier?.email ?? ''} placeholder="orders@supplier.com" />
          </FormField>
        </FormGrid>
      </FormSection>

      <FormSection id="gst" n={2} title="GST & address" aside="For input tax on purchase bills" done={sections[1].done}>
        <FormGrid>
          <FormField label="GSTIN" optional htmlFor="sup-gstin" span={3} help={<GstinStatus gstin={gstin} blank="Without one, bills from them carry no input tax." />}>
            <Input
              id="sup-gstin"
              value={gstin}
              onChange={(e) => onGstinChange(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="33AAAAA0000A1Z5"
              autoComplete="off"
              className="font-mono uppercase"
            />
          </FormField>
          <FormField
            label="State"
            htmlFor="sup-state"
            span={3}
            help={gst.valid && gst.state === state ? 'Filled from the GSTIN.' : local ? 'Same state as you: bills carry CGST + SGST.' : 'Another state: bills carry IGST.'}
          >
            <select id="sup-state" value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
              {STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Address" optional htmlFor="sup-address" span={6}>
            <Textarea id="sup-address" name="address" rows={2} defaultValue={supplier?.address ?? ''} placeholder="Door no., street, area, city" className="min-h-[64px] resize-none" />
          </FormField>
        </FormGrid>
      </FormSection>
    </FormSheet>
  );
}
